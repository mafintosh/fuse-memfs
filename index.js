const FileSystem = require('./fs')

module.exports = function (opts) {
  const fs = new FileSystem()
  const log = opts && opts.log ? console.log : () => {}

  const ops = {
    statfs (path, cb) {
      cb(0, {
        bsize: 1000000,
        frsize: 1000000,
        blocks: 1000000,
        bfree: 1000000,
        bavail: 1000000,
        files: 1000000,
        ffree: 1000000,
        favail: 1000000,
        fsid: 1000000,
        flag: 1000000,
        namemax: 1000000
      })
    },
    getxattr (path, name, pos, cb) {
      log('getxattr', path, name)
      try {
        cb(0, fs.getxattr(path, name))
      } catch (err) {
        console.log(err)
        cb(err.errno)
      }
    },
    setxattr (path, name, value, pos, flags, cb) {
      log('setxattr', path, name, value)
      try {
        fs.setxattr(path, name, value)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    },
    removexattr (path, name, cb) {
      log('removexattr', path, name)
      try {
        fs.removexattr(path, name)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    },
    listxattr (path, cb) {
      log('listxattr', path)
      try {
        cb(0, fs.listxattr(path))
      } catch (err) {
        cb(err.errno)
      }
    },
    readdir (path, cb) {
      log('readdir', path)
      try {
        cb(0, fs.readdir(path))
      } catch (err) {
        cb(err.errno)
      }
    },
    getattr (path, cb) {
      log('getattr', path)
      try {
        cb(0, fs.stat(path))
      } catch (err) {
        cb(err.errno)
      }
    },
    fgetattr (path, fd, cb) {
      log('fgetattr', path, fd)
      try {
        cb(0, fs.fstat(fd))
      } catch (err) {
        cb(err.errno)
      }
    },
    truncate (path, size, cb) {
      log('truncate', path, size)
      try {
        fs.truncate(path, size)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    },
    ftruncate (path, fd, size, cb) {
      log('ftruncate', path, fd, size)
      try {
        fs.ftruncate(fd, size)
        log('truncted?')
        cb(0)
      } catch (err) {
        log(err)
        cb(err.errno)
      }
    },
    link (from, to, cb) {
      log('link', from, to)
      try {
        fs.link(from, to)
        cb(0)
      } catch (err) {
        console.log(err)
        cb(err.errno)
      }
    },
    rename (from, to, cb) {
      log('rename', from, to)
      try {
        fs.rename(from, to)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    },
    create (path, mode, cb) {
      log('create', path, mode)
      try {
        cb(0, fs.open(path, fs.constants.O_RDWR | fs.constants.O_CREAT))
      } catch (err) {
        log(err)
        cb(err.errno)
      }
    },
    unlink (path, cb) {
      log('unlink', path)
      try {
        fs.unlink(path)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    },
    open (path, flags, cb) {
      log('open', path, flags)
      try {
        cb(0, fs.open(path, flags))
      } catch (err) {
        cb(err.errno)
      }
    },
    release (path, fd, cb) {
      log('release', path, fd)
      try {
        fs.close(fd)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    },
    read (path, fd, buf, len, pos, cb) {
      log('read', path, fd, len, pos)
      try {
        cb(fs.read(fd, buf, 0, len, pos))
      } catch (err) {
        cb(err.errno)
      }
    },
    write (path, fd, buf, len, pos, cb) {
      log('write', path, fd, len, pos)
      try {
        cb(fs.write(fd, buf, 0, len, pos))
      } catch (err) {
        cb(err.errno)
      }
    },
    mkdir (path, mode, cb) {
      log('mkdir', path, mode)
      try {
        fs.mkdir(path, mode)
        cb(0)
      } catch (err) {
        cb(err.errno)
      }
    }
  }

  return ops
}
