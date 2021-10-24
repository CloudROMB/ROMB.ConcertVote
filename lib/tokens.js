const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

module.exports.comparePassword = function (pass, hash) {
  try {
    return bcrypt.compareSync(pass, hash);
  } catch (err) {
    console.log(err.message);
    return false
  }
};

module.exports.signTokenAsync = function (user) {
  const token_user = JSON.parse(JSON.stringify(user));
  delete token_user.pass;
  token_user.stamp = new Date().toISOString();

  return new Promise(function (resolve, reject) {
    jwt.sign(token_user, config.auth.secretKey, {expiresIn: '24h'}, (err, token) => {
      if (err)
        reject(err);
      else
        resolve(token);
    });
  });
};

module.exports.signToken = function (user, cb) {
  const token_user = JSON.parse(JSON.stringify(user));
  delete token_user.pass;
  token_user.stamp = new Date().toISOString();

  jwt.sign(token_user, config.auth.secretKey, {expiresIn: '24h'}, cb);
};

module.exports.hashPassword = function (pass) {
  try {
    const salt = bcrypt.genSaltSync(11);
    return bcrypt.hashSync(pass, salt);
  } catch (err) {
    console.error('ERROR HASH PASS:', err.message);
    return null;
  }
};

module.exports.getUserByToken = function (req) {
  try {
    if (!(req.cookies && req.cookies.token)) {
      console.log('- getUserByToken: There is no token', req.cookies);
      return null;
    }

    const token = req.cookies.token;
    return jwt.verify(token, config.auth.secretKey, (err, authData) => {
      if (err) {
        console.log('- bearer error:', err.message);
        return null;
      }

      console.log('+ getUserByToken:', authData.name);
      return authData;
    });
  } catch (err) {
    console.log('- ERROR getUserByToken:', err.message);
    return null;
  }
};

module.exports.checkCredential = function (req, credential) {
  try {
    if (!(req.cookies && req.cookies.token)) {
      console.log('- checkCredential: There is no token', req.cookies);
      // res.redirect(302, '/login?' + Math.random());
      return false
    }

    const token = req.cookies.token;
    return jwt.verify(token, config.auth.secretKey, (err, authData) => {
      if (err) {
        console.log('- checkCredential bearer error:', err.message);
        return false;
      }

      // console.log('AUTH DATA:', authData);
      const user = authData;
      if (user && typeof user.credentials === 'string' && user.credentials.indexOf(credential) >= 0) {
        console.log('+ checkCredential: has credentials', credential);
        return true
      } else {
        console.log('- checkCredential: no credentials', credential);
        return false
      }
    });
  } catch (err) {
    console.log('- ERROR checkCredential:', err.message);
    return false;
  }
};

module.exports.verifyToken = function (req, res, next) {
  // if (req.method !== 'POST') {
  //   res.sendStatus(201);
  // }
  // console.log('Cookies: ', req.cookies);
  // console.log('--------- req.method', req.method);

  if (!(req.cookies && req.cookies.token)) {
    console.log('- verifyToken: There is no token', req.cookies);
    if (req.method === 'GET') {
      return res.redirect(302, '/login?' + Math.random());
    } else {
      return res.status(403).json({
        result: false,
        message: 'no authorization was provided'
      })
    }
  }

  req.token = req.cookies.token;
  // console.log('token', req.token);

  return jwt.verify(req.token, config.auth.secretKey, (err, authData) => {
    if (err) {
      console.log('- bearer error:', err.message);
      if (req.method === 'GET') {
        return res.redirect(302, '/login?' + Math.random());
      } else {
        return res.status(403).json({
          result: false,
          message: err.message
        })
      }
    }

    console.log('+ bearer OK:', authData.name);
    module.exports.authData = authData;
    req.authData = authData;
    next()
  });

  // const bearerHeader = req.headers['authorization'];
  // if (typeof bearerHeader === 'undefined') {
  //   //  forbidden
  //   console.log('bearerHeader === undefined');
  //   // res.redirect(302, '/login?' + Math.random());
  //   res.status(403).json({
  //     result: false,
  //     message: 'no authorization was provided'
  //   })
  // } else {
  //   const bearer = bearerHeader.split(' ');
  //   req.token = bearer[1];
  //   // console.log('token', req.token);
  //
  //   jwt.verify(bearer[1], config.auth.secretKey, (err, authData) => {
  //     if (err) {
  //       console.log('bearer error:', err.message);
  //       // res.redirect(302, '/login?' + Math.random());
  //       res.status(403).json({
  //         result: false,
  //         message: err.message
  //       })
  //     } else {
  //       req.authData = authData;
  //       module.exports.authData = authData;
  //       next()
  //     }
  //   });
  // }
};

module.exports.noGetMethod = function (router) {
  /* GET users listing. */
  router.get('*', (req, res, next) => {
    res.render('standart', {message: 'no method was provided'});
    // res.status(405).json({
    //   result: false,
    //   message: "no method was provided"
    // });
  });
};

module.exports.fillCommonTemplateParams = async function (req) {
  const user = module.exports.getUserByToken(req);
  const isAdmin = module.exports.checkCredential(req, 'admin');
  const isJury = module.exports.checkCredential(req, 'jury');
  const obj = {
    title: 'Child Eurovision',
    user: user,
    isAdmin: isAdmin,
    isJury: isJury,
    showFooter: true
  };
  if (user && user.name) {
    obj.username = user.name;
  }

  if (req.app && req.app.get('DB')) {
    const db = req.app.get('DB');

    const mayChangeVoices = await db.getValue('mayChangeVoices');
    obj.mayChangeVoices = Number(mayChangeVoices) === 1;

    const myVoiceVisible = await db.getValue('MyVoiceVisible');
    obj.myVoiceVisible = Number(myVoiceVisible) === 1;

    const voteActive = await db.getValue('voteActive');
    obj.isVoteActive = Number(voteActive) === 1;
    // console.log('params.isVoteActive', params.isVoteActive, voteActive);

    obj.contestname = await db.getValue('contest');
  }

  // console.log('---- params', obj);

  return obj;
};
