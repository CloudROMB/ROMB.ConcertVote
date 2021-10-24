const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/config');
const fs = require('fs');
const gm = require('gm').subClass({imageMagick: true});

// const upload = multer({dest: '../freshdata/attachments/'});
const attachDir = config.environment.upload_dir_full;
// console.log('+++ attachDir', attachDir);
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // console.log('file1', file, attachDir);
    cb(null, attachDir);
  },
  filename: function (req, file, cb) {
    const hash = crypto.createHash('md5').update(file.originalname + Date.now().toString()).digest('hex');
    try {

// resize and remove EXIF profile data
// gm('./data/files/66e3dcc28226a9a5661eb91cf1e75a9d.bmp')
//       gm('./data/files/HighResScreenShot_2017-11-08_00-37-16.bmp')
//         .noProfile()
//         .resize(1600, 1600)
//         .autoOrient()
//         .quality(60)
//         .write(`./data/files/resize${Math.random(1000)}.jpg`, function (err) {
//           if (!err) console.log('done')
//           // else console.log(err);
//         });

      console.log('+file', file, attachDir);
      const fileTarget = {
        fieldname: file.fieldname,
        fileName: file.originalname,
        contentType: file.mimetype,
        generatedFileName: hash + path.extname(file.originalname),
        length: 0,
        stamp: new Date().toISOString()
      };
      // console.log('upload:', fileTarget);
      // console.log('new file:', fileTarget);
      cb(null, fileTarget.generatedFileName)
    } catch (e) {
      console.log('MULTER ERROR:', e);
      cb(e, null)
    }
  },
  limits: {
    fileSize: config.environment.MAX_UPLOAD_SIZE_BYTES,
    files: config.environment.MAX_UPLOAD_FILES_COUNT
  },
  fileFilter: (req, file, cb) => {
    checkFileType(file, cb);
  }
});
// const upload = multer({storage: storage}).single('image');
// const upload = multer({storage: storage});
const upload = multer({storage: storage}).any();

function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif|tif|tiff|bmp/;
  const mimeTypes = /jpeg|jpg|png|gif|tif|tiff|bmp/;

  const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeType = mimeTypes.test(file.mimetype);

  if (extName && mimeType) {
    return cb(null, true)
  } else {
    return cb('wrong file type!');
  }
}

module.exports = upload;
