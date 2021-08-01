const constants = require('filesystem-constants')
const c = process.platform === 'darwin' ? constants.darwin : constants.linux

class Inode {
  constructor (fs, mode, opts) {
    this.ctime = new Date()
    this.atime = new Date()
    this.mtime = new Date()
    this.mode = mode
    this.uid = opts.uid || 0
    this.gid = opts.gid || 0
    this.ino = opts.ino || (fs ? ++fs.inodes : 0)
    this.nlink = opts.nlink || 1
    this.entries = []
    this.blocks = []
    this.size = 0
  }
}

class Entry {
  constructor (mode, opts) {
    this.fs = opts.fs || null
    this.name = opts.name || ''
    this.inode = opts.inode || new Inode(opts.fs, mode, opts)
    this.attributes = new Map()
  }

  isDirectory () {
    return !!(this.inode.mode & c.S_IFDIR)
  }

  isFile () {
    return !!(this.inode.mode & c.S_IFREG)
  }

  setAttribute (name, val) {
    this.attributes.set(name, val)
  }

  getAttribute (name) {
    return this.attributes.get(name)
  }

  removeAttribute (name) {
    this.attributes.delete(name)
  }

  listAttributes () {
    return [ ...this.attributes.keys() ]
  }

  reset () {
    this.inode.mtime = new Date()
    this.inode.blocks = []
    this.inode.size = 0
    this.inode.entries = []
  }

  stat () {
    const blocks = Math.ceil(this.inode.size / 512)

    return {
      ctime: this.inode.ctime,
      atime: this.inode.atime,
      mtime: this.inode.mtime,
      mode: this.inode.mode,
      size: this.inode.size,
      blocks,
      dev: 0,
      rdev: 0,
      nlink: this.inode.nlink,
      ino: this.inode.ino,
      uid: this.inode.uid,
      gid: this.inode.gid
    }
  }

  chown (uid, gid) {
    this.inode.uid = uid
    this.inode.gid = gid
  }

  chmod (mode) {
    const mask = this.isDirectory()
      ? c.S_IFDIR
      : this.isFile()
        ? c.S_IFREG
        : 0

    this.inode.mode = mode | mask
  }

  utimes (atime, mtime) {
    this.inode.atime = timeToDate(atime)
    this.inode.mtime = timeToDate(mtime)
  }
}

class Directory extends Entry {
  constructor (opts = {}) {
    super(0 | 0o555 | 0o333 | c.S_IFDIR, opts)
    this.inode.size = 512
  }

  isEmpty () {
    return this.inode.entries.length === 0
  }

  readdir () {
    return this.inode.entries.map(entry => entry.name)
  }

  mkdir (name) {
    if (this.exists(name)) EEXIST('mkdir', name)
    return this.push(new Directory({ fs: this.fs, name }))
  }

  create (name, mode) {
    const exists = this.get(name)

    if (exists) {
      exists.reset()
      return exists
    }

    return this.push(new File({ fs: this.fs, name, mode }))
  }

  exists (name) {
    return !!this.get(name)
  }

  rmdir (name) {
    const exists = this.get(name)
    if (!exists) ENOENT('rmdir', name)
    if (!exists.isDirectory()) ENOTDIR('rmdir', name)
    if (!exists.isEmpty()) ENOTEMPTY('rmdir', name)
    this.remove(exists)
  }

  unlink (name) {
    const exists = this.get(name)
    if (!exists) ENOENT('unlink', name)
    if (exists.isDirectory()) EPERM('unlink', name)
    this.remove(exists)
  }

  remove (entry) {
    const i = this.inode.entries.indexOf(entry)
    if (i > -1) {
      this.inode.entries.splice(i, 1)
      this.inode.mtime = new Date()
      entry.inode.nlink--
    }
  }

  push (entry) {
    this.inode.entries.push(entry)
    this.inode.mtime = new Date()
    return entry
  }

  get (name) {
    for (const entry of this.inode.entries) {
      if (entry.name === name) return entry
    }
    return null
  }
}

const BLOCK_SIZE = 1024 * 1024

class File extends Entry {
  constructor (opts = {}) {
    super(0 | 0o444 | 0o222 | c.S_IFREG, opts)
  }

  truncate (size) {
    this.inode.size = size
    const cnt = Math.ceil(size / BLOCK_SIZE)
    this.inode.blocks = this.inode.blocks.slice(0, cnt)
    this.inode.mtime = new Date()
  }

  read (offset, buffer) {
    let i = Math.floor(offset / BLOCK_SIZE)
    let o = offset % BLOCK_SIZE
    let start = 0

    while (start < buffer.length && offset < this.inode.size) {
      let blk = this.inode.blocks[i++] || Buffer.alloc(BLOCK_SIZE)

      if (i * BLOCK_SIZE + blk.length > this.inode.size) {
        blk = blk.slice(0, this.inode.size - i * BLOCK_SIZE)
      }

      if (o) {
        blk = blk.slice(o)
        o = 0
      }

      blk.copy(buffer.slice(start))
      offset += blk.length
      start += blk.length
    }

    this.inode.atime = new Date()
    return Math.min(buffer.length, start)
  }

  write (offset, buffer) {
    let i = Math.floor(offset / BLOCK_SIZE)
    let o = offset % BLOCK_SIZE
    let start = 0

    if (offset + buffer.length > this.inode.size) {
      this.inode.size = offset + buffer.length
    }

    while (start < buffer.length && offset < this.inode.size) {
      if (!this.inode.blocks[i]) this.inode.blocks[i] = Buffer.alloc(BLOCK_SIZE)
      let blk = this.inode.blocks[i++]

      if (o) {
        blk = blk.slice(o)
        o = 0
      }

      buffer.slice(start).copy(blk)
      start += blk.length
      offset += blk.length
    }

    this.inode.mtime = new Date()
    return Math.min(buffer.length, start)
  }
}

class FileDescriptor {
  constructor (flag, id) {
    const n = typeof flag === 'string' ? constants.parse(c, flag) : flag

    this.file = null
    this.id = id

    const acc = n & c.O_ACCMODE

    this.readable = acc === c.O_RDONLY || acc === c.O_RDWR
    this.writable = acc === c.O_WRONLY || acc === c.O_RDWR
    this.appending = !!(n & c.O_APPEND)
    this.exclusive = !!(n & c.O_EXCL)
    this.creating = !!(n & c.O_CREAT)
    this.position = 0
  }

  read (buffer) {
    const read = this.file.read(this.position, buffer)
    this.position += read
    return read
  }

  write (buffer) {
    this.file.write(this.position, buffer)
    this.position += buffer.length
    return buffer.length
  }

  truncate (size) {
    this.file.truncate(size)
  }

  stat () {
    return this.file.stat()
  }
}

class FileSystem {
  constructor () {
    this.constants = c
    this.root = new Directory({ fs: this })
    this.fds = []
    this.inodes = 0
  }

  lookup (path, name = 'lookup') {
    const parts = split(path)
    let cur = this.root

    for (const p of parts) {
      if (!cur.isDirectory()) ENOTDIR(name, path)
      cur = cur.get(p)
      if (!cur) ENOENT(name, path)
    }

    return cur
  }

  lookupFd (fd, name = 'lookupFd') {
    const desc = this.fds[fd - 20]
    if (!desc) EBADF(name, fd)
    return desc
  }

  link (from, to) {
    const f = this._parentDir(from)
    const t = this._parentDir(to)

    const fe = f.parent.get(f.name)
    if (!fe) ENOENT('link', from)
    if (fe.isDirectory()) EISDIR('link', from)

    const te = t.parent.get(t.name)
    if (te) EEXIST('link', to)

    fe.nlink++
    t.parent.push(new File({ fs: this.fs, inode: fe.inode, name: t.name }))
  }

  rename (from, to) {
    const f = this._parentDir(from)
    const t = this._parentDir(to)

    const fe = f.parent.get(f.name)
    if (!fe) ENOENT('rename', from)

    const te = t.parent.get(t.name)

    if (te) {
      if (te.isDirectory() && !fe.isDirectory()) EISDIR('rename', to)
      if (fe.isDirectory() && !te.isDirectory()) ENOTDIR('rename', to)
      if (fe.isDirectory() && te.isDirectory() && !te.isEmpty()) ENOTEMPTY('rename', to)
      t.parent.remove(te)
    }

    fe.name = t.name;
    f.parent.remove(fe)
    t.parent.push(fe)
  }

  stat (path) {
    return this.lookup(path, 'stat').stat()
  }

  fstat (fd) {
    return this.lookupFd(fd, 'fstat').stat()
  }

  truncate (path, size) {
    this.lookup(path, 'truncate').truncate(size)
  }

  ftruncate (fd, size) {
    this.lookupFd(fd, 'ftruncate').truncate(size)
  }

  open (path, flag, mode) {
    const desc = new FileDescriptor(flag, this.fds.length + 20)

    const { parent, name } = this._parentDir(path)

    let file = parent.get(name)

    if (file && !file.isFile()) EPERM('open', path)
    if (desc.exclusive && file) EEXIST('open', path)
    if (desc.readable && !desc.writable && !file) ENOENT('open', path)
    if (file && !desc.appending && desc.writable) file.reset()

    if (!file) {
      if (!desc.creating) ENOENT('open', path)
      file = parent.create(name, mode || 0)
    }

    if (desc.appending) desc.position = file.inode.size
    desc.file = file

    this.fds.push(desc)
    return desc.id
  }

  close (fd) {
    const desc = this.fds[fd - 20]
    if (!desc) EBADF('close', fd)
    this.fds[fd - 20] = null
    while (this.fds.length && !this.fds[this.fds.length - 1]) this.fds.pop()
  }

  read (fd, buf, offset = 0, length = buf.length, position) {
    const desc = this.lookupFd(fd, 'read')
    if (typeof position === 'number') desc.position = position
    return desc.read(buf.slice(offset, offset + length))
  }

  write (fd, buf, offset = 0, length = buf.length, position) {
    const desc = this.lookupFd(fd, 'write')
    if (typeof position === 'number') desc.position = position
    return desc.write(buf.slice(offset, offset + length))
  }

  setxattr (path, name, value) {
    const entry = this.lookup(path, 'setxattr')
    const buf = Buffer.from(value)
    entry.setAttribute(name, buf)
  }

  getxattr (path, name) {
    const entry = this.lookup(path, 'getxattr')
    const val = entry.getAttribute(name)
    return val
  }

  listxattr (path) {
    const entry = this.lookup(path, 'listxattr')
    return entry.listAttributes()
  }

  removexattr (path, name) {
    const entry = this.lookup(path, 'listxattr')
    entry.removeAttribute(name)
  }

  readdir (path) {
    const dir = this.lookup(path, 'readdir')
    if (dir.isDirectory()) return dir.readdir()
    ENOTDIR('readdir', path)
  }

  rmdir (path) {
    const { parent, name, parentPath } = this._parentDir(path, 'rmdir')
    if (parent.isDirectory()) parent.rmdir(name)
    else ENOTDIR('rmdir', parentPath)
  }

  unlink (path) {
    const { parent, name, parentPath } = this._parentDir(path, 'unlink')
    if (parent.isDirectory()) parent.unlink(name)
    else ENOTDIR('unlink', parentPath)
  }

  mkdir (path, mode = 0) {
    const { parent, name, parentPath } = this._parentDir(path, 'mkdir')
    if (parent.isDirectory()) parent.mkdir(name, mode)
    else ENOTDIR('mkdir', parentPath)
  }

  chmod (path, mode) {
    const entry = this.lookup(path, 'chmod')
    entry.chmod(mode)
  }

  chown (path, uid, gid) {
    const entry = this.lookup(path, 'chown')
    entry.chown(mode, uid, gid)
  }

  utimes (path, atime, ctime) {
    const entry = this.lookup(path, 'utimes')
    entry.utimes(mode, atime, ctime)
  }

  _parentDir (path, name = 'lookup') {
    const parts = split(path)
    const p = parts.pop()
    if (!p) EINVAL(name, path)

    const dir = this.lookup(parts, name)
    const dirPath = '/' + parts.join('/')
    if (!dir.isDirectory()) ENOTDIR(dirPath)
    return { parent: dir, name: p, parentPath: dirPath }
  }
}

module.exports = FileSystem

function split (path) {
  return Array.isArray(path) ? path : path.split('/').filter(notEmpty)
}

function notEmpty (s) {
  return s
}

function timeToDate (ms) {
  return typeof ms === 'number' ? new Date(ms) : ms
}

function ENOENT (method, name) {
  throw createError('ENOENT', -2, `no such file or directory, ${method} '${name}'`)
}

function ENOTDIR (method, name) {
  throw createError('ENOTDIR', -20, `not a directory, ${method} '${name}'`)
}

function EINVAL (method, name) {
  throw createError('EINVAL', -23, `invalid argument, ${method} '${name}'`)
}

function EPERM (method, name) {
  throw createError('EPERM', -1, `operation not permitted, ${method} '${name}'`)
}

function EBADF (method, name) {
  throw createError('EBADF', -9, `bad file descriptor, ${method} '${name}'`)
}

function ENOTEMPTY (method, name) {
  throw createError('ENOTEMPTY', -66, `directory not empty, ${method} '${name}'`)
}

function EEXIST (method, name) {
  throw createError('EEXIST', -17, `file already exists, ${method} '${name}'`)
}

function EISDIR (method, name) {
  throw createError('EISDIR', -21, `illegal operation on a directory, ${method} '${name}'`)
}

function createError (code, errno, name) {
  const err = new Error(code + ': ' + name)
  err.errno = errno
  err.code = code
  return err
}
