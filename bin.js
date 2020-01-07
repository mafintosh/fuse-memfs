#!/usr/bin/env node

const Fuse = require('fuse-native')
const memops = require('./')
const f = new Fuse(process.argv[2] || './mnt', memops({ log: true }))

f.mount(function () {
  console.log('mounted ...')

  process.once('SIGINT', function () {
    f.unmount(function (err) {
      console.log('unmounted', err)
      process.exit()
    })
  })
})
