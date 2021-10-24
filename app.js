const createError = require('http-errors');
// const hbs = require('express-handlebars');
const hbs = require('hbs');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const favicon = require('serve-favicon');
const bodyParser = require('body-parser');

const countries = require('./config/country');
// console.log(decodeURIComponent(countries.RU));

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const contenders = require('./routes/contenders');
const manage = require('./routes/manage');
const app = express();

const db = require('./lib/db').connectDB()
  .then(db => {
    app.set('DB', db);
    // console.log('DB:', app.get('DB'));
  });

app.set('views', path.join(__dirname, 'views'));
hbs.registerPartials(__dirname + '/views/partials');
app.set('view engine', 'hbs');
// app.set('view engine', 'html');
app.engine('html', hbs.__express);

app.use(favicon(path.join(__dirname, 'public', '/assets/img/logo/logo_256.png')));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({extended: false, limit: '50mb'}));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));
// app.use(express.static(path.join(__dirname, 'data')));
app.use(express.static('./data'));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/contenders', contenders);
app.use('/manage', manage);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // res.redirect('/');
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  if (req.method === 'GET') {
    return res.redirect(302, '/login');
  } else {
    return res.status(403).json({
      result: false,
      message: 'no authorization was provided'
    })
  }

  // render the error page
  // res.status(err.status || 500);
  // res.render('error');
});

module.exports = app;
