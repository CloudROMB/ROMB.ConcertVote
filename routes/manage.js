const path = require('path');
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');
const tokens = require('../lib/tokens');
const countries = require('../config/country');
const DB = require('../lib/db');

router.post('/init', function (req, res) {
  try {
    if (!(req.app && req.app.get('DB'))) {
      return res.json({
        result: false,
        message: 'DataBase not prepared',
        type: 'error',
        method: '/manage/init'
      });
    }
    const db = req.app.get('DB');

    // DB.prepareDB_ext(db);
    DB.prepareDB(db);

    return res.json({
      result: true,
      message: 'INIT done'
    });
  } catch (err) {
    return res.json({
      result: false,
      message: JSON.stringify(err.message),
      type: 'error',
      method: '/manage/init'
    });
  }
});

// !!! NEXT METHOD CHECK THE AUTH
router.use(tokens.verifyToken, (req, res, next) => {
  next();
});

router.get('/', async function (req, res, next) {
  const params = await tokens.fillCommonTemplateParams(req);
  params.header = 'Управление и настройки';

  const db = req.app.get('DB');

  params.nominationsList = await getNominationsList(db);
  params.nominationsList.forEach(nom => {
    if (nom.evaluations) {
      try {
        nom.evals = JSON.parse(nom.evaluations);
        if (!(nom.evals && nom.evals instanceof Array)) {
          nom.evals = [];
        }
      } catch (err) {
        nom.evals = [];
      }
    }

    if (nom.uniquevoices) {
      try {
        nom.unique = JSON.parse(nom.uniquevoices);
        if (!(nom.unique && nom.unique instanceof Array)) {
          nom.unique = [];
        }
      } catch (err) {
        nom.unique = [];
      }
    }
  });

  params.usersList = await getUsersList(db);
  params.usersList.forEach(user => {
    user.countries = [];
    let country;
    Object.keys(countries).forEach((key) => {
      country = {
        code: key,
        name: countries[key],
      };
      if (key === user.countryshort) {
        country.selected = 'selected';
      }
      user.countries.push(country)
    });
    user.countries.sort((a, b) => {
      return (b.name > a.name);
    });

    if (user.credentials) {
      try {
        user.cred = JSON.parse(user.credentials);
        if (!(user.cred && user.cred instanceof Array)) {
          user.cred = [];
        }
      } catch (err) {
        user.cred = [];
      }
    }
  });

  res.render('layouts/manage', params);
});

router.get('/delvoices', async function (req, res, next) {
  const db = req.app.get('DB');
  await db.runAsync(`DELETE FROM voices`);
  res.redirect('/manage');
});

// db.close((err) => {
//   if (err) {
//     console.error(err.message);
//   }
//   console.log('Close the database connection.');
// });

router.post('/data', function (req, res) {
  if (req.body && req.body.data) {
    return db.run("UPDATE contenders SET value = value + 1 WHERE key = ?", "counter", function (err, row) {
      if (err) {
        console.err(err);
        res.status(500);
      } else {
        res.status(202);
      }
      return res.end();
    });
  } else {
    return {
      result: false,
      message: 'wrong parameters'
    }
  }
});

router.post('/savecontestname', async function (req, res) {
  const db = req.app.get('DB');
  if (db && req.body && req.body.contestname && typeof req.body.contestname === 'string' && req.body.contestname.trim()) {
    await db.setValue('contest', req.body.contestname);
  }
  res.redirect('/manage');
});

router.get('/nomination/delete/:id', async function (req, res) {
  try {
    const db = req.app.get('DB');
    let rowid = req.params.id;
    if (rowid) {
      const SQL = `
      UPDATE nominations SET 
        deleted = 1
      WHERE
        rowid = ${rowid}`;
      const dbres = await db.runAsync(SQL);
      console.log('DELETED nomination:', rowid, dbres);
    } else {
      throw new Error('Wrong parameters');
    }
  } catch (e) {
    console.error(e.message);
  }

  res.redirect('/manage');
});

router.get('/nomination/add', async function (req, res) {
  try {
    const db = req.app.get('DB');
    const SQL = `INSERT INTO nominations (name, evaluations, uniquevoices, active) VALUES
        ("Номинация 1", "[1, 2, 3, 4, 5]", "[10, 12]", 0)`;
    const dbres = await db.insertAsync(SQL);
    console.log('INSERTED nomination:', dbres);
  } catch (e) {
    console.error(e.message);
  }

  res.redirect('/manage');
});

router.get('/nomination/setvotestate/:state', async function (req, res) {
  try {

    const db = req.app.get('DB');
    const state = (req.params && req.params.state && Number(req.params.state) === 1) ? 1 : 0;
    await db.setValue('voteActive', state);
    console.log('+++ req.params.state', state, req.params.state, await db.getValue('voteActive'));
  } catch (e) {
    console.error('setvotestate:', e.message);
  }

  res.redirect('/manage');
});

router.get('/nomination/setmaychange/:state', async function (req, res) {
  try {
    const db = req.app.get('DB');
    const state = (req.params && req.params.state && Number(req.params.state) === 1) ? 1 : 0;
    await db.setValue('mayChangeVoices', state);
    console.log('+++ mayChangeVoices', state, req.params.state, await db.getValue('mayChangeVoices'));
  } catch (e) {
    console.error('setmaychange:', e.message);
  }

  res.redirect('/manage');
});

router.get('/nomination/myvoicevisible/:state', async function (req, res) {
  try {
    const db = req.app.get('DB');
    const state = (req.params && req.params.state && Number(req.params.state) === 1) ? 1 : 0;
    await db.setValue('MyVoiceVisible', state);
    console.log('+++ MyVoiceVisible', state, req.params.state, await db.getValue('MyVoiceVisible'));
  } catch (e) {
    console.error('MyVoiceVisible:', e.message);
  }

  res.redirect('/manage');
});

router.post('/nomination/put/:id', async function (req, res) {
  console.log('+++ body:', req.body);

  try {
    const db = req.app.get('DB');

    let rowid = req.body.rowid;
    let row;
    let SQL;
    if (rowid) {
      SQL = `SELECT * FROM nominations WHERE rowid=${rowid}`;
      row = await db.getAsync(SQL);
    }

    const name = req.body.name || 'Без названия';
    const active = (req.body.active === 'on') ? 1 : 0;

    let evaluations;
    if (req.body.evaluations) {
      try {
        evaluations = JSON.stringify(JSON.parse(req.body.evaluations));
      } catch (e) {
        evaluations = '[]';
      }
    } else {
      evaluations = '[]';
    }

    let uniquevoices;
    if (req.body.uniquevoices) {
      try {
        uniquevoices = JSON.stringify(JSON.parse(req.body.uniquevoices));
      } catch (e) {
        uniquevoices = '[]';
      }
    } else {
      uniquevoices = '[]';
    }

    if (!row) {
      SQL = `INSERT INTO nominations (name, evaluations, uniquevoices, active) VALUES
        ("${name}", "${evaluations}", "${uniquevoices}", ${active})`;
      const dbres = await db.insertAsync(SQL);
      console.log('INSERTED nomination: ', 'lastrow:', dbres);
    } else {
      SQL = `UPDATE nominations SET 
        name = "${name}",
        evaluations = "${evaluations}",
        uniquevoices = "${uniquevoices}",
        active = ${active}
      WHERE
        rowid = ${rowid}`;
      const dbres = await db.updateAsync(SQL);
      console.log('UPDATED nomination:', rowid, 'rows:', dbres);
    }
  } catch (e) {
    console.error(e.message);
  }

  res.redirect('/manage');
  // if (req.body && req.body.data) {
  //   return db.run("UPDATE contenders SET value = value + 1 WHERE key = ?", "counter", function (err, row) {
  //     if (err) {
  //       console.err(err);
  //       res.status(500);
  //     } else {
  //       res.status(202);
  //     }
  //     return res.end();
  //   });
  // } else {
  //   return {
  //     result: false,
  //     message: 'wrong parameters'
  //   }
  // }
});

async function getNominationsList(db) {
  try {
    const sql = `SELECT * FROM nominations WHERE deleted<>1`;
    const rows = await db.allAsync(sql);
    return rows;
  } catch (err) {
    console.error('getNominationsList:', err.message);
    return [];
  }
}

async function getUsersList(db) {
  try {
    const sql = `
      SELECT *
      FROM
        users
      WHERE
        deleted <> 1 AND
        rowid <> 1
    `;
    // const sql = `SELECT * FROM users WHERE rowid <> 1`;
    return await db.allAsync(sql);
  } catch (err) {
    console.error('getUsersList:', err.message);
    return [];
  }
}

router.getNominationsList = getNominationsList;
module.exports = router;
