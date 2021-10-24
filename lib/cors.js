const cors = require('cors');
const colors = require('colors/safe'); // does not alter string prototype

const whitelist = [
  'http://localhost',
  'http://localhost:3300',
];

let currentOrigin;
const corsOptions = {
  origin: function (origin, callback) {
    console.log('ORIGIN', origin);
    if (typeof origin !== 'undefined' && whitelist.indexOf(origin) !== -1) {
      currentOrigin = origin;
      console.log('ORIGIN 2', origin);
      callback(null, true)
    } else {
      // callback(null, true)
      callback(new Error('Not allowed by CORS'))
    }
  }
};

const corsOptionsAll = {
  origin: "http://localhost",
  methods: "GET,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 201
};

const corsOptionsDelegate = function (req, callback) {
  let corsOptions;
  currentOrigin = undefined;
  console.log('ORIGIN', req.header('Origin'));
  if (req.header('Origin') && whitelist.indexOf(req.header('Origin')) !== -1) {
    console.log('GOOD ORIGIN', whitelist.indexOf(req.header('Origin')));
    corsOptions = {origin: true}; // reflect (enable) the requested origin in the CORS response
    currentOrigin = req.header('Origin');
  } else {
    console.log('BAD ORIGIN');
    corsOptions = {origin: false} // disable CORS for this request
  }
  callback(null, corsOptions) // callback expects two parameters: error and options
};

module.exports.checkCORS = function (router) {
// check CORS rules
  router.options('*', cors(corsOptionsDelegate), function (req, res, next) {
    if (typeof currentOrigin === 'undefined') {
      res.sendStatus(400);
    } else {
      res.sendStatus(204);
    }
  });

};

module.exports.setCORSHeaders = function (router) {
  // make headers for auth and CORS
  router.use((req, res, next) => {
    console.log(colors.yellow('SET HEADERS'));
    res.append('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Headers, Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Credentials, Authorization');
    // res.append('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Headers, Access-Control-Allow-Origin, Access-Control-Allow-Methods, Authorization');
    // res.append('Access-Control-Allow-Origin', 'http://localhost');
    if (currentOrigin) {
      res.append('Access-Control-Allow-Origin', currentOrigin);
    } else {
      res.append('Access-Control-Allow-Origin', '*');
    }
    res.append('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.append('Access-Control-Allow-Credentials', 'true');
    res.append('Access-Control-Max-Age', '3600');
    // res.append('Content-Type', 'application/json');
    next();
  });
};
