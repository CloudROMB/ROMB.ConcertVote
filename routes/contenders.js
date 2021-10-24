const express = require('express');
const router = express.Router();
const tokens = require('../lib/tokens');
const countries = require('../config/country');
const upload = require('../lib/uploads');

// !!! NEXT METHOD CHECK THE AUTH
router.use(tokens.verifyToken, (req, res, next) => {
  next();
});

router.get('/', async function (req, res, next) {
  try {
    const user = tokens.getUserByToken(req);
    const db = req.app.get('DB');
    if (!(req.app && db && user)) {
      return res.json({
        result: false,
        message: 'DataBase not prepared',
        type: 'error',
        method: '/manage/init'
      });
    }

    const params = await tokens.fillCommonTemplateParams(req);
    params.header = 'Голосование';
    params.contendersList = [];

    let sql, voices, rows;
    // let sql = `SELECT * FROM contenders WHERE active=1`;
    sql = `SELECT * FROM contenders WHERE deleted <> 1 ORDER BY name`;
    rows = await db.allAsync(sql);

    const nom = await db.getValue('nominations');
    // console.log('+ nom: ', nom);
    sql = `SELECT * FROM nominations
      WHERE deleted <> 1 AND active = 1
      ORDER BY name`;
    const nominations = await db.allAsync(sql);
    const userNoms = JSON.parse(user.nominations) || nominations.map(nom => {
      return nom.rowid
    });

    // console.log('SELECT ROWS:', rows);
    rows.forEach(async (cont) => {
      sql = `SELECT * FROM voices
        WHERE contender=${cont.rowid} AND user=${user.rowid}`;
      voices = await db.allAsync(sql);
      cont.voiced = (userNoms.length === voices.length);
      cont.myVoiceVisible = params.myVoiceVisible;

      let i, eval;
      sql = `
        SELECT * FROM voices AS V
        INNER JOIN nominations AS N
        ON N.rowid = V.nomination
        WHERE
          N.deleted <> 1
          AND V.user = ${user.rowid}
          AND V.contender = ${cont.rowid}
      `;
      // console.log('`````', sql);
      voices = await db.allAsync(sql)
        .catch(err => {
          console.log('--- ERROR2 ', err.message);
        });
      cont.voices = voices;

      eval = 0;
      if (voices && voices.length) {
        voices.forEach(voice => {
          eval += voice.voice;
        });
        cont.evaluation = (eval / voices.length).toFixed(2);
      }

    });
    params.contendersList = rows;
    if (req.params.sort === 'evaluation') {
      params.contendersList.sort((a, b) => a.evaluation - b.evaluation);
    }

    // console.log('params', params);
    res.render('layouts/contenders', params);
  } catch (err) {
    console.error(err.message);
    res.redirect('/contenders');
  }
});

router.get('/:id', async function (req, res, next) {
  if (!(req.app && req.app.get('DB'))) {
    return res.json({
      result: false,
      message: 'DataBase not prepared',
      type: 'error',
      method: '/manage/init'
    });
  }
  try {
    const db = req.app.get('DB');
    const id = req.params.id;
    const params = await tokens.fillCommonTemplateParams(req);
    let countryshort = 'RU';

    if (id && id !== 'add') {
      let sql = `SELECT * FROM contenders WHERE rowid=${id}`;
      const row = await db.getAsync(sql);
      params.contender = row;

      if (row && row.countryshort) {
        countryshort = row.countryshort;
      }

      if (row && row.photo) {
        params.contender.userphoto = '/files/' + row.photo;
      }
    } else {
      params.contender = {
        rowid: id
      };
    }
    // if (rows.length) {
    //   params.contender = rows[0];
    // }
    // console.log(rows);

    params.countries = [];
    console.log(decodeURIComponent(countries.RU));
    Object.keys(countries).forEach((key) => {
      const country = {
        code: key,
        name: countries[key],
      };
      if (key === countryshort) {
        country.selected = 'selected';
      }
      params.countries.push(country)
    });
    params.countries.sort((a, b) => {
      return (b.name > a.name);
    });

    params.header = 'Карточка участника';
    // console.log('+ contender params:', params);
    res.render('layouts/contender', params);
  } catch (err) {
    console.error(err.message);
    res.redirect('/contenders');
  }
});

router.get('/delete/:id', async function (req, res, next) {
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
    const id = req.params.id;

    const sql = `
      UPDATE contenders
      SET deleted = 1
      WHERE rowid = ${id}
    `;
    const res = await db.updateAsync(sql);
  } catch (err) {
    console.error('ERROR /contenders/delete', err.message);
  }

  res.redirect('/contenders');
});

router.post('/vote/:id', async function (req, res, next) {
  try {
    const db = req.app.get('DB');
    if (!(req.params.id && req.body && db)) {
      throw new Error('Wrong params');
    }
    const user = tokens.getUserByToken(req);
    Object.keys(req.body).forEach(async (key) => {
      const arr = key.split('_');
      let sql, row;
      if (arr instanceof Array && arr.length > 1) {
        console.log('nomination', arr[1], 'value', req.body[key]);
        sql = `
          SELECT * FROM voices
          WHERE
            contender = ${req.params.id}
            AND nomination = ${arr[1]}
            AND user = ${user.rowid} 
          `;
        row = await db.getAsync(sql);
        console.log('+++', row, sql);

        if (!row) {
          sql = `
            INSERT INTO voices
              (contender, nomination, user, voice)
            VALUES (
              ${req.params.id},
              ${arr[1]},
              ${user.rowid},
              ${req.body[key]}
             )`;
          const row = await db.insertAsync(sql)
            .catch(err => {
              console.log('+++ ERROR', sql, err.message);
            });
          console.log('+++ INSERTED', row, sql);
        } else {
          sql = `
            UPDATE voices
            SET
              voice = (${req.body[key]})
            WHERE
              contender = ${req.params.id}
              AND nomination = ${arr[1]}
              AND user = ${user.rowid} 
            `;
          const row = await db.updateAsync(sql)
            .catch(err => {
              console.log('+++ ERROR', sql, err.message);
            });
          console.log('+++ UPDATED', row, sql);
        }
      }
    });
  } catch (err) {
    console.error(err.message);
  }

  res.redirect('/contenders');
});

router.post('/changevotes', async function (req, res, next) {
  try {
    console.log('+++ body:', req.body);

    if (!(req.app && req.app.get('DB'))) {
      throw new Error('DataBase not prepared');
    }
    const db = req.app.get('DB');

    const keys = Object.keys(req.body);

    let key, arr;
    for (let i = 0; i < keys.length; i++) {
      key = keys[i];
      arr = JSON.parse(req.body[key]);
      console.log(arr);

      if (arr && arr.length === 3) {
        const sql = `
          UPDATE voices
          SET voice = ${arr[2]}
          WHERE user = ${arr[1]} AND rowid = ${arr[0]} 
        `;
        const res = await db.updateAsync(sql);
      }
    }
    return res.redirect('/editresults');
  } catch (err) {
    console.error('POST /update/newvotes', err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: 'POST /update/newvotes'
    });
  }
})
;

router.post('/info/:id', async function (req, res, next) {
  try {
    const id = req.params.id;
    const user = tokens.getUserByToken(req);

    const db = req.app.get('DB');
    if (!(req.app && db && id && user)) {
      return res.json({
        result: false,
        message: 'DataBase not prepared',
        type: 'error',
        method: '/manage/init'
      });
    }

    const params = await tokens.fillCommonTemplateParams(req);
    let countryshort = 'RU';

    let sql = `SELECT * FROM contenders WHERE rowid=${id}`;
    const row = await db.getAsync(sql);

    params.voteActive = await db.getValue('voteActive');

    sql = `SELECT * FROM nominations WHERE deleted<>1 AND active=1`;
    const allNoms = await db.allAsync(sql);
    // console.log('allNoms:', allNoms, sql);
    const userNoms = JSON.parse(user.nominations) || allNoms.map(nom => {
      return nom.rowid
    });
    // console.log('userNoms:', userNoms);
    params.nominationsList = [];
    allNoms.forEach(nom => {
      if (userNoms.includes(nom.rowid)) params.nominationsList.push(nom);
    });

    let nom;
    for (let no = 0; no < params.nominationsList.length; no++) {
      nom = params.nominationsList[no];
      // console.log('nominations', userNoms, nom.rowid, typeof userNoms, userNoms.includes(nom.rowid));
      sql = `SELECT * FROM voices
        WHERE contender=${id} AND user=${user.rowid} AND nomination=${nom.rowid}`;
      const voice = await db.getAsync(sql);
      nom.voice = (voice) ? voice.voice : 0;

      sql = `SELECT * FROM voices
        WHERE user=${user.rowid} AND nomination=${nom.rowid}`;
      const voices = await db.allAsync(sql);

      if (nom.evaluations) {
        try {
          nom.evals = JSON.parse(nom.evaluations);
          if (!(nom.evals && nom.evals instanceof Array)) {
            nom.evals = [];
          }
        } catch (err) {
          nom.evals = [];
        }
      } else {
        nom.evals = [];
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
      } else {
        nom.unique = [];
      }
      nom.disabledVoices = [];
      voices.forEach(v => {
        if (nom.unique.includes(v.voice)) {
          nom.disabledVoices.push(v.voice);
        }
      })

      // console.log('@@@ evaluations', nom);
    }

    if (row && row.countryshort) {
      countryshort = row.countryshort;
    }

    if (row && row.photo) {
      row.userphoto = '/files/' + row.photo;
    }

    if (row && row.hobby && row.hobby.trim()) {
      row.hobbyArr = JSON.parse(row.hobby.trim());
    }

    params.contender = row;

    params.header = 'Карточка участника';
    params.result = true;

    // console.log('+++ params', params);
    res.json(params);
  } catch (err) {
    console.error('- POST /info/:id', err);
    res.json({
      result: false,
      message: err.message
    });
  }
});

router.post('/update/:id', upload, async function (req, res, next) {
  try {
    console.log('+++ file:', req.file);

    if (!(req.app && req.app.get('DB'))) {
      return res.json({
        result: false,
        message: 'DataBase not prepared',
        type: 'error',
        method: 'POST /contenders/id'
      });
    }
    const db = req.app.get('DB');
    console.log('rows: ', req.body);

    let files = [];
    if (req.files && req.files instanceof Array) {
      req.files.forEach(file => {
        files.push({
          fileName: file.originalname,
          contentType: file.mimetype,
          generatedFileName: file.filename,
          length: file.size,
          created: new Date().toISOString()
        });
      });
    }

    const id = req.params.id;
    let data;
    let params;
    let lastID;
    let sql;

    if (id && id !== 'add') {
      sql = `SELECT * FROM contenders WHERE rowid=${id}`;
      const row = await db.getAsync(sql);
      console.log('ROW:', row);

      if (row) {
        lastID = row.rowid;
        data = [];

        if (!files.length && row.photo) {
          req.body.photo = row.photo;
        }

        params = fillContenderParamsAsync(req.body, data, files);
        sql = `UPDATE contenders SET ${params} WHERE rowid = ${lastID}`;
        console.log('UPDATE sql:', sql);
        const upd = await db.runAsync(sql);
        console.log('Updated contender:', upd);
      }
    }

    if (!lastID) {
      data = [];
      params = fillContenderParamsAsync(req.body, data, files, true);
      sql = `INSERT INTO contenders ${params}`;
      console.log('INSERT sql:', sql);
      const ins = await db.runAsync(sql);
      console.log('Inserted contender:', ins);
      // lastID = this.lastID;
    }

    if (lastID) {
      res.redirect('/contenders/' + lastID);
    } else {
      res.redirect('/contenders');
    }
  } catch (err) {
    console.error('POST /contenders/id', err.message);
    return res.json({
      result: false,
      message: err.message,
      type: 'error',
      method: 'POST /contenders/id'
    });
  }
});

/* GET users listing. */
// function fillContenderParams(body, data, files, insert = false) {
//   let params = '';
//   let vals = '';
//   data.length = 0;
//
//   if (!(body && data)) {
//     return params;
//   }
//
//   // country
//   let countryshort = '';
//   let country = '';
//   if (body.countryshort) {
//     countryshort = body.countryshort;
//     country = countries[countryshort];
//   }
//
//   // photo
//   let photo = '';
//   if (files && files.length) {
//     photo = files[0].fileName;
//   }
//
//   // active
//   let active = 1;
//   if (body.active) {
//     active = 1;
//   } else {
//     active = 0;
//   }
//
//   if (body.name) {
//     data.push(body.name);
//     if (insert) {
//       params += 'name,';
//       vals += '(?),';
//     } else {
//       params += 'name = ?,';
//     }
//   }
//   if (body.action) {
//     data.push(body.action);
//     if (insert) {
//       params += 'action,';
//       vals += '(?),';
//     } else {
//       params += 'action = ?,';
//     }
//   }
//   if (body.age) {
//     data.push(Number(body.age));
//     if (insert) {
//       params += 'age,';
//       vals += '(?),';
//     } else {
//       params += 'age = ?,';
//     }
//   }
//   if (body.about) {
//     data.push(body.about);
//     if (insert) {
//       params += 'about,';
//       vals += '(?),';
//     } else {
//       params += 'about = ?,';
//     }
//   }
//   if (body.education) {
//     data.push(body.education);
//     if (insert) {
//       params += 'education,';
//       vals += '(?),';
//     } else {
//       params += 'education = ?,';
//     }
//   }
//   if (body.hobby) {
//     data.push(body.hobby);
//     if (insert) {
//       params += 'hobby,';
//       vals += '(?),';
//     } else {
//       params += 'hobby = ?,';
//     }
//   }
//   if (body.city) {
//     data.push(body.city);
//     if (insert) {
//       params += 'city,';
//       vals += '(?),';
//     } else {
//       params += 'city = ?,';
//     }
//   }
//
//   data.push(country);
//   data.push(countryshort);
//   data.push(active);
//   data.push(photo);
//   if (insert) {
//     params += 'country, countryshort, active, photo';
//     vals += '(?),(?),(?),(?)';
//   } else {
//     params += 'country=?, countryshort=?, active=?, photo=?';
//   }
//
//   if (params.charAt(params.length - 1) === ',') {
//     params = params.slice(0, params.length - 1);
//   }
//
//   if (insert) {
//     params = `(${params}) VALUES (${vals})`;
//   }
//
//   return params;
// }

function fillContenderParamsAsync(body, data, files, insert = false) {
  let params = '';
  let vals = '';

  if (!(body && data)) {
    return params;
  }

  // country
  let countryshort = '';
  let country = '';
  if (body.countryshort) {
    countryshort = body.countryshort;
    country = countries[countryshort];
  }

  // photo
  let photo = body.photo || '';
  if (files && files.length) {
    photo = files[0].generatedFileName;
  }
  console.log('+++ photo:', body.photo, photo, files.length);

  // active
  let active = 1;
  if (body.active) {
    active = 1;
  } else {
    active = 0;
  }

  if (body.name) {
    data.push(body.name);
    if (insert) {
      params += 'name,';
      vals += `('${body.name}'),`;
    } else {
      params += `name = ('${body.name}'),`;
    }
  }
  if (body.action) {
    data.push(body.action);
    if (insert) {
      params += 'action,';
      vals += `('${body.action}'),`;
    } else {
      params += `action = ('${body.action}'),`;
    }
  }
  if (body.age) {
    data.push(Number(body.age));
    if (insert) {
      params += 'age,';
      vals += `(${body.age}),`;
    } else {
      params += `age = (${body.age}),`;
    }
  }
  if (body.about) {
    data.push(body.about);
    if (insert) {
      params += 'about,';
      vals += `('${body.about}'),`;
    } else {
      params += `about = ('${body.about}'),`;
    }
  }
  if (body.education) {
    data.push(body.education);
    if (insert) {
      params += 'education,';
      vals += `('${body.education}'),`;
    } else {
      params += `education = ('${body.education}'),`;
    }
  }
  if (body.hobby) {
    data.push(body.hobby);
    if (insert) {
      params += 'hobby,';
      vals += `('${body.hobby}'),`;
    } else {
      params += `hobby = ('${body.hobby}'),`;
    }
  }
  if (body.city) {
    data.push(body.city);
    if (insert) {
      params += 'city,';
      vals += `('${body.city}'),`;
    } else {
      params += `city = ('${body.city}'),`;
    }
  }

  data.push(country);
  data.push(countryshort);
  data.push(active);
  data.push(photo);
  if (insert) {
    params += 'country, countryshort, active, photo';
    vals += `('${country}'),('${countryshort}'),(${active}),('${photo}')`;
  } else {
    params += `country=('${country}'), countryshort=('${countryshort}'), active=(${active}), photo=('${photo}')`;
  }

  if (params.charAt(params.length - 1) === ',') {
    params = params.slice(0, params.length - 1);
  }
  if (vals.charAt(vals.length - 1) === ',') {
    vals = vals.slice(0, vals.length - 1);
  }

  if (insert) {
    params = `(${params}) VALUES (${vals})`;
  }

  return params;
}

module.exports = router;
