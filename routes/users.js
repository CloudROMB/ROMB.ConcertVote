const express = require('express');
const router = express.Router('strict');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');
const tokens = require('../lib/tokens');
const countries = require('../config/country');

router.post('/login', async function (req, res, next) {
  console.log('/users/login BODY:', req.body, 'DB:', req.app.get('DB'));

  if (!(req.app && req.app.get('DB'))) {
    console.error('- login error: DataBase not prepared');
    return res.json({
      result: false,
      message: 'DataBase not prepared',
      type: 'error',
      method: '/manage/init'
    });
  }
  const db = req.app.get('DB');

  try {
    const login = req.body.login;
    const pass = req.body.pass;

    if (!(login && pass)) {
      console.error('- login error: no user name or password were provided');
      return res.json({
        result: false,
        status: 401,
        message: "no user name or password were provided",
        type: 'error',
        method: '/users/login'
      });
    }

    let sql = `SELECT * FROM users WHERE login='${login}'`;
    const user = await db.getAsync(sql);
    if (user && typeof user === 'object') {
      if (user.pass === pass) {
        const token = await tokens.signTokenAsync(user);
        if (!token) {
          console.error(err.message);
          return res.json({
            result: false,
            message: err.message,
            status: 501,
            type: 'error',
            method: '/users/login'
          })
        }

        delete user.pass;

        res.cookie('token', token, {maxAge: 86400000});
        res.cookie('user', JSON.stringify(user), {maxAge: 86400000});

        console.error('+ login', user.name);
        return res.json({
          result: true,
          token: token,
          user: user,
          method: '/users/login'
        });
      } else {
        console.error('- login error: wrong password');
        return res.json({
          result: false,
          status: 403,
          message: "wrong password",
          type: 'error',
          method: '/users/login'
        });
      }
    } else {
      console.error('- login error: Where is no user ' + login);
      return res.json({
        result: false,
        message: 'Where is no user ' + login,
        type: 'warning',
        method: '/users/delete'
      })
    }
  } catch (err) {
    console.error(err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/users/login'
    });
  }
});

router.post('/register', function (req, res, next) {
  console.log('register BODY:', req.body);

  if (!(req.app && req.app.get('DB'))) {
    return res.json({
      result: false,
      message: 'DataBase not prepared',
      type: 'error',
      method: '/manage/init'
    });
  }
  const db = req.app.get('DB');

  try {
    if (req.body && req.body.login && req.body.pass && req.body.username) {
      const login = req.body.login;
      const pass = req.body.pass;
      const username = req.body.username;

      let sql = `SELECT login FROM users WHERE login=?`;
      db.all(sql, [login], (err, rows) => {
        if (err) {
          return res.json({
            result: false,
            message: err.message,
            type: 'error',
            method: '/register'
          });
        }

        console.log('rows: ', rows);
        if (!rows.length) {
          db.run(`INSERT INTO users (login, pass, name, credentials) VALUES (?, ?, ?, ?)`,
            [login, pass, username, '["jury"]'], (err) => {
              if (err) {
                return res.json({
                  result: false,
                  message: err.message,
                  type: 'error',
                  method: '/register'
                });
              }

              console.log('Inserted user:', req.body.login);
              return res.json({
                result: true,
                message: 'Add user: ' + req.body.login,
                method: '/register'
              })
            });
        } else {
          return res.json({
            result: false,
            message: 'User already exists',
            type: 'warning',
            method: '/register'
          })
        }
      });
    } else {
      return res.json({
        result: false,
        message: 'wrong parameters',
        type: 'error',
        method: '/register'
      })
    }
  } catch (err) {
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/register'
    })
  }
});

function fillUserUpdateParams(body, data) {
  let params = '';
  data.length = 0;

  if (!(body && data)) {
    return params;
  }

  if (body.login) {
    data.push(body.login);
    params += `login = "${body.login}",`;
  }

  if (body.pass) {
    data.push(body.pass);
    params += `pass = "${body.pass}",`;
  }

  if (body.position) {
    data.push(body.position);
    params += `position = "${body.position}",`;
  }

  if (body.name) {
    data.push(body.name);
    params += `name = "${body.name}",`;
  }

  let credentials;
  if (body.credentials) {
    try {
      credentials = JSON.stringify(JSON.parse(body.credentials));
    } catch (e) {
      credentials = '["jury"]';
    }

    data.push(credentials);
    params += `credentials = '${credentials}',`;
  }

  let nominations;
  if (body.nominations) {
    try {
      const nom = body.nominations;
      nominations = JSON.stringify(JSON.parse(nom));
    } catch (e) {
      nominations = '[3, 5, 6]';
    }

    data.push(nominations);
    params += `nominations = '${nominations}',`;
  }

  if (body.about) {
    data.push(body.about);
    params += `about = "${body.about}",`;
  }

  if (body.photo) {
    data.push(body.photo);
    params += `photo = "${body.photo}",`;
  }

  if (body.countryshort) {
    data.push(body.countryshort);
    params += `countryshort = "${body.countryshort}",`;

    let country;
    Object.keys(countries).forEach((key) => {
      if (key === body.countryshort) {
        country = countries[key];
      }
    });
    if (country) {
      data.push(country);
      params += `country = '${country}',`;
    }
  }

  if (body.city) {
    data.push(body.city);
    params += `city = "${body.city}",`;
  }

  // last param without comma!!!
  if (params.charAt(params.length - 1) === ',') {
    params = params.slice(0, params.length - 1);
  }

  return params;
}

function fillUserInsertParams(body, data) {
  let params = '';
  let values = '';
  data.length = 0;

  if (!(body && data)) {
    return params;
  }

  const login = body.login || `login${(Math.random() * 1000).toFixed()}`;
  data.push(login);
  params += `login,`;
  values += `'${login}',`;

  const pass = body.pass || `pass${(Math.random() * 1000).toFixed()}`;
  data.push(pass);
  params += `pass,`;
  values += `'${pass}',`;

  if (body.position) {
    data.push(body.position);
    params += `position,`;
    values += `'${body.position}',`;
  }

  const username = body.name || 'New jury';
  data.push(username);
  params += `name,`;
  values += `'${username}',`;

  let credentials;
  if (body.credentials) {
    try {
      credentials = JSON.stringify(JSON.parse(req.body.credentials));
    } catch (e) {
      credentials = '["jury"]';
    }

    data.push(credentials);
    params += `credentials,`;
    values += `'${credentials}',`;
  }

  let nominations;
  if (body.nominations) {
    try {
      nominations = JSON.stringify(JSON.parse(req.body.nominations));
    } catch (e) {
      nominations = '[3, 5, 6]';
    }

    data.push(nominations);
    params += `nominations,`;
    values += `'${nominations}',`;
  }

  if (body.about) {
    data.push(body.about);
    params += `about,`;
    values += `'${body.about}',`;
  }

  if (body.photo) {
    data.push(body.photo);
    params += `photo,`;
    values += `'${body.photo}',`;
  }

  const countryshort = body.countryshort || 'RU';
  data.push(countryshort);
  params += `countryshort,`;
  values += `'${countryshort}',`;

  let country;
  Object.keys(countries).forEach((key) => {
    if (key === countryshort) {
      country = countries[key];
    }
  });
  if (country) {
    data.push(country);
    params += `country,`;
    values += `'${country}',`;
  }

  if (body.city) {
    data.push(body.city);
    params += `city,`;
    values += `'${body.city}',`;
  }

  // last param without comma!!!
  if (params.charAt(params.length - 1) === ',') {
    params = params.slice(0, params.length - 1);
  }
  if (values.charAt(values.length - 1) === ',') {
    values = values.slice(0, values.length - 1);
  }

  return '(' + params + ') VALUES (' + values + ')';
}

// !!! NEXT METHOD CHECK THE AUTH
router.use(tokens.verifyToken, (req, res, next) => {
  next();
});

router.get('/addnew', async function (req, res, next) {
  console.log('+add new user');

  try {
    const db = req.app.get('DB');
    if (!db) {
      throw new Error('DataBase not prepared');
    }

    const login = `login${(Math.random() * 1000).toFixed()}`;
    const pass = `pass${(Math.random() * 1000).toFixed()}`;
    const username = 'New jury';
    const credentials = '["jury"]';

    let sql = `
        INSERT INTO users (login, pass, name, credentials)
        VALUES (
          "${login}",
          "${pass}",
          "${username}",
          '${credentials}'
        )`;
    console.log('+add new SQL:', sql);
    const dbres = await db.insertAsync(sql);
    if (!dbres) throw new Error('Bad request');

    res.redirect('/manage');
  } catch (err) {
    console.error(err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/users/addnew'
    })
  }
});

router.get('/delete/:id', async function (req, res, next) {
  try {
    const id = req.params.id;
    console.log('+delete user', id);

    if (id === 1) throw new Error('This is system admin');

    if (!id) throw new Error('Bad ID');

    const db = req.app.get('DB');
    if (!db) {
      throw new Error('DataBase not prepared');
    }

    const theuser = await db.getAsync(`SELECT * from users WHERE rowid = ${id}`);
    if (theuser) {
      const deleted = theuser.deleted;
      const del = (deleted === 1) ? 0 : 1;
      const sql = `
      UPDATE users SET 
        deleted = ${del}
      WHERE
        rowid = ${id}`;
      await db.updateAsync(sql);
    }
    res.redirect('/manage');
  } catch (err) {
    console.error(err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/users/addnew'
    })
  }
});

router.post('/put/:id', async function (req, res) {
  console.log('+++ body:', req.body);

  try {
    const db = req.app.get('DB');

    let rowid = req.body.rowid;
    let row;
    let SQL;
    if (rowid) {
      SQL = `SELECT * FROM users WHERE rowid=${rowid}`;
      row = await db.getAsync(SQL);
    }
    console.log('row:', row, rowid);


    if (!row) {
      const data = [];
      const params = fillUserInsertParams(req.body, data);
      SQL = `INSERT INTO users ${params}`;
      const dbres = await db.insertAsync(SQL);
      console.log('INSERTED user: ', 'lastrow:', dbres);
    } else {
      const data = [];
      const params = fillUserUpdateParams(req.body, data);
      SQL = `UPDATE users SET ${params} 
                WHERE rowid = ${rowid}`;
      const dbres = await db.updateAsync(SQL);
      console.log('UPDATED user:', rowid, 'rows:', dbres, SQL);
    }
  } catch (e) {
    console.error('/users/put/ ERROR:', e.message);
  }

  res.redirect('/manage');
});


router.put('/change', function (req, res, next) {
  console.log('/users/change BODY:', req.body);

  if (!(req.app && req.app.get('DB'))) {
    return res.json({
      result: false,
      message: 'DataBase not prepared',
      type: 'error',
      method: '/manage/init'
    });
  }
  const db = req.app.get('DB');

  try {
    if (req.body && req.body.login) {
      const login = req.body.login;

      let sql = `SELECT DISTINCT login FROM users WHERE login=?`;
      db.all(sql, [login], (err, rows) => {
        if (err) {
          console.error(err.message);
          return res.json({
            result: false,
            message: err.message,
            type: 'error',
            method: '/users/change'
          });
        }

        console.log('rows: ', rows);
        if (rows.length) {
          const data = [];
          const params = fillUserUpdateParams(req.body, data);

          if (!(data && data.length)) {
            return res.json({
              result: false,
              message: 'nothing to update',
              type: 'warning',
              method: '/users/change'
            });
          }

          // const data = [
          //   req.body.pass,
          //   req.body.name,
          //   req.body.position,
          //   req.body.credentials,
          //   req.body.about,
          //   req.body.photo,
          //   login
          // ];

          // where condition
          data.push(login);
          const sql = `UPDATE users
            SET ${params}
            WHERE login = ?`;
          db.run(sql, data, function (err) {
            if (err) {
              console.error(err.message);
              return res.json({
                result: false,
                message: err.message,
                params: params,
                sql: sql,
                type: 'error',
                method: '/users/change'
              });
            }
            console.log('Updated user:', login);
            return res.json({
              result: true,
              params: params,
              message: 'update user: ' + login
            })
          });
        } else {
          return res.json({
            result: false,
            message: 'Where is no user ' + login,
            type: 'warning',
            method: '/users/change'
          })
        }
      });
    } else {
      return res.json({
        result: false,
        message: 'wrong parameters',
        type: 'error',
        method: '/users/change'
      })
    }
  } catch (err) {
    console.error(err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/users/change'
    })
  }
});

router.delete('/delete', function (req, res, next) {
  console.log('/users/delete BODY:', req.body);

  try {
    const db = req.app.get('DB');
    if (!db) {
      throw new Error('DataBase not prepared');
    }

    if (req.body && req.body.login) {
      const login = req.body.login;

      let sql = `SELECT login, credentials FROM users WHERE
        login=? AND ((credentials IS NULL) OR (credentials NOT LIKE '%admin%'))`;
      db.all(sql, [login], (err, rows) => {
        if (err) {
          console.error(err.message);
          return res.json({
            result: false,
            message: err.message,
            sql: sql,
            type: 'error',
            method: '/users/delete'
          });
        }

        console.log('rows: ', rows);
        if (rows.length) {
          let sql = `DELETE FROM users WHERE login=?`;
          db.all(sql, [login], (err, rows) => {
            if (err) {
              console.error(err.message);
              return res.json({
                result: false,
                message: err.message,
                type: 'error',
                method: '/users/delete'
              });
            }
          });

          console.log('Deleted user:', login);
          return res.json({
            result: true,
            message: 'delete user: ' + login
          })
        } else {
          return res.json({
            result: false,
            message: 'Where is no common user ' + login,
            sql: sql,
            data: rows,
            type: 'warning',
            method: '/users/delete'
          })
        }
      });
    } else {
      return res.json({
        result: false,
        message: 'wrong parameters',
        type: 'error',
        method: '/users/delete'
      })
    }
  } catch (err) {
    console.error(err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/users/delete'
    })
  }
});

router.get('/list', async function (req, res, next) {
  console.log('/users/list BODY:', req.body);

  try {
    const db = req.app.get('DB');
    if (!db) {
      throw new Error('DataBase not prepared');
    }

    const login = req.body.login;
    const pass = req.body.pass;
    const username = req.body.username;

    let sql = `SELECT * FROM users WHERE deleted <> 1`;
    const rows = await db.allAssync(sql);
    if (!rows) {
      throw new Error('Bad request');
    }

    return res.json({
      result: true,
      data: rows
    });
  } catch (err) {
    console.error(err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: '/user/list'
    })
  }
});

module.exports = router;
