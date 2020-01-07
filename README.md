# fuse-memfs

In memory filesystem backed by FUSE and Javascript

```
npm install -g fuse-memfs
```

## Usage

```
fuse-memfs ./mnt # mounts an in memory filesystem at ./mnt (needs to exists)
```

## Javascript API

You can access the FUSE operations from JS as well

```js
const Fuse = require('fuse-native')
const memfs = require('fuse-memfs')
const ops = memfs()

const fuse = new Fuse('./mnt', ops)
```

## License

MIT
