const express = require('express');
const router = express.Router();
const tokens = require('../lib/tokens');

/* GET home page. */
router.get('/', function (req, res, next) {
  // res.redirect(302, '/login?' + Math.random());

  const user = tokens.getUserByToken(req);
  if (user) {
    res.redirect('/contenders');
  } else {
    res.redirect('/login');
  }
});

router.get('/login', function (req, res, next) {
  res.render('layouts/login', {
    title: 'Child Eurovision',
    header: 'Авторизация пользователей',
    isLogin: true
  });
});

router.get('/dashboard', tokens.verifyToken, async function (req, res, next) {
  const params = await tokens.fillCommonTemplateParams(req);
  params.header = 'Панель показателей конкурса';

  // console.log('/dashboard', params);
  res.render('layouts/dashboard', params);
});

router.get('/results', tokens.verifyToken, function (req, res, next) {
  return res.redirect('/results/name');
});

router.get('/results/:sort', tokens.verifyToken, async function (req, res, next) {
  const params = await tokens.fillCommonTemplateParams(req);
  params.header = 'Результаты голосований';
  try {
    let sortBy;
    const clentSortBy = req.params.sort.toLowerCase();
    if (clentSortBy === 'average' || clentSortBy === 'percents') {
      sortBy = '';
    } else if (req.params.sort) {
      sortBy = req.params.sort + ',';
    } else {
      sortBy = '';
    }
    // console.log('`````', sortBy);

    const db = req.app.get('DB');
    let sql = `
      SELECT * FROM
        contenders
      WHERE
        deleted <> 1
        AND active = 1
      ORDER BY ${sortBy} name
    `;
    // console.log('`````', sql);
    params.contendersList = await db.allAsync(sql)
      .catch(err => {
        console.log('----- ERROR ', err.message);
        throw new Error(err);
      });

    sql = `
      SELECT
        SUM(V.voice) as voice
      FROM
        voices AS V
      INNER JOIN nominations AS N
        ON N.rowid = V.nomination
      INNER JOIN users AS U
        ON U.rowid = V.user
      WHERE
        U.deleted <> 1
        AND V.voice > 0
        AND N.deleted <> 1
        AND N.active = 1
      `;
    const sumVoices = await db.getAsync(sql)
      .catch(err => {
        console.log('----- ERROR ', err.message);
        throw new Error(err);
      });
    params.sumVoices = sumVoices.voice;
    // console.log('+++++', params.sumVoices, sumVoices);

    sql = `SELECT * FROM nominations
      WHERE deleted <> 1 AND active = 1
      ORDER BY name`;
    params.nominations = await db.allAsync(sql);

    let con, i, eval;
    for (i = 0; i < params.contendersList.length; i++) {
      con = params.contendersList[i];
      con.isAdmin = params.isAdmin;

      let sql = `
        SELECT V.contender as contender, SUM(V.voice) as voice, COUNT(V.rowid) as cnt
        FROM
          voices AS V
        INNER JOIN nominations AS N
          ON N.rowid = V.nomination
        INNER JOIN users AS U
          ON U.rowid = V.user
        WHERE
          V.contender = ${con.rowid}
          AND V.voice > 0
          AND U.deleted = 0
          AND N.deleted <> 1
          AND N.active = 1
        GROUP BY
          V.contender
      `;
      const voices = await db.allAsync(sql)
        .catch(err => {
          console.log('----- ERROR ', err.message);
          throw new Error(err);
        });
      con.voices = voices;
      // console.log('`````', con.voices);

      // sql = `
      //   SELECT *
      //   FROM voices AS V
      //   INNER JOIN nominations AS N
      //   ON N.rowid = V.nomination
      //   WHERE
      //     N.deleted <> 1
      //     AND V.contender = ${con.rowid}
      // `;
      // // console.log('`````', sql);
      // const voices = await db.allAsync(sql)
      //   .catch(err => {
      //     console.log('--- ERROR2 ', err.message);
      //   });
      // con.voices = voices;

      sql = `
        SELECT U.name AS name, V.voice AS voice
        FROM
          voices AS V
        INNER JOIN users AS U
          ON U.rowid = V.user
        INNER JOIN nominations AS N
          ON N.rowid = V.nomination
        WHERE
          V.contender = ${con.rowid}
          AND V.voice > 0
          AND U.deleted = 0
          AND N.deleted <> 1
          AND N.active = 1
      `;
      // console.log('`````', sql);
      con.juryvoices = await db.allAsync(sql)
        .catch(err => {
          console.log('--- ERROR3 ', err.message);
          throw new Error(err);
        });

      sql = `
        SELECT V.nomination as rowid, COUNT(V.voice) as cnt, SUM(V.voice) as voice
        FROM
          voices AS V
        INNER JOIN nominations AS N
          ON N.rowid = V.nomination
        WHERE
          V.contender = ${con.rowid}
          AND V.voice > 0
          AND N.deleted <> 1
          AND N.active = 1
        GROUP BY
          V.nomination
      `;
      const evaluations = await db.allAsync(sql)
        .catch(err => {
          console.log('--- ERROR3 ', err.message);
          throw new Error(err);
        });
      con.evaluations = [];
      params.nominations.forEach(nom => {
        let found = false;
        evaluations.forEach(eval => {
          if (eval.rowid === nom.rowid) {
            found = true;
            con.evaluations.push((eval.voice / eval.cnt).toFixed(2));
          }
        });
        if (!found) {
          con.evaluations.push(0);
        }
      });
      // console.log('````` evaluations', con.evaluations);

      eval = 0;
      evalPercent = 0;
      if (voices && voices.length) {
        voices.forEach(voice => {
          eval += (voice.voice / voice.cnt);
          evalPercent += voice.voice / params.sumVoices * 100;
          // eval += voice.voice;
        });
        con.average = (eval / voices.length).toFixed(2);
        con.evaluationPercent = evalPercent.toFixed(2);
        // if (params.sumVoices <= 0) {
        //   con.evaluationPercent = 0;
        // } else {
        //   con.evaluationPercent = (con.average / params.sumVoices * 100).toFixed(2);
        // }
      }
      if (!con.average || con.average < 0) {
        con.average = 0;
      }
    }
    if (req.params.sort === 'average') {
      params.contendersList.sort((a, b) => b.average - a.average);
    }
    if (req.params.sort === 'percents') {
      params.contendersList.sort((a, b) => b.evaluationPercent - a.evaluationPercent);
    }

    // console.log('----- params', params);
  } catch (err) {
    console.error('/results/:sort', err);
  }

  console.log('----- params', params);
  res.render('layouts/results', params);
});

router.get('/editresults', tokens.verifyToken, async function (req, res, next) {
  const params = await tokens.fillCommonTemplateParams(req);
  params.header = 'Редактировать результаты голосований';
  try {
    const db = req.app.get('DB');
    params.mayChangeResults = (db.getValue('mayChangeResults') === '1') ? true : false;
    console.log('-----------', await db.getValue('mayChangeResults'), params.mayChangeResults);

    let sql = `SELECT * FROM nominations
      WHERE deleted <> 1 AND active = 1
      ORDER BY name`;
    params.nominations = await db.allAsync(sql);

    sql = `
      SELECT * FROM contenders
      WHERE
        deleted <> 1
      ORDER BY name
    `;
    params.contendersList = await db.allAsync(sql)
      .catch(err => {
        console.log('----- ERROR ', err.message);
        params.contendersList = [];
      });

    let con, i, eval;
    for (i = 0; i < params.contendersList.length; i++) {
      con = params.contendersList[i];
      con.isAdmin = params.isAdmin;

      let sql = `
        SELECT V.contender as contender, SUM(V.voice) as voice, COUNT(V.rowid) as cnt
        FROM
          voices AS V
        INNER JOIN nominations AS N
          ON N.rowid = V.nomination
        INNER JOIN users AS U
          ON U.rowid = V.user
        WHERE
          V.contender = ${con.rowid}
          AND V.voice > 0
          AND U.deleted = 0
          AND N.deleted <> 1
          AND N.active = 1
        GROUP BY
          V.contender
      `;
      // console.log('`````', sql);
      const voices = await db.allAsync(sql)
        .catch(err => {
          console.log('--- ERROR2 ', err.message);
        });
      con.voices = voices;

      sql = `
        SELECT V.rowid AS vid, U.rowid AS uid, V.voice as voice, U.name AS name
        FROM
          voices AS V
        INNER JOIN users AS U
          ON U.rowid = V.user
        INNER JOIN nominations AS N
          ON N.rowid = V.nomination
        WHERE
          V.contender = ${con.rowid}
          AND V.voice > 0
          AND U.deleted = 0
          AND N.deleted <> 1
          AND N.active = 1
      `;
      // console.log('`````', sql);
      con.juryvoices = await db.allAsync(sql)
        .catch(err => {
          console.log('--- ERROR juryvoices', err.message);
          con.juryvoices = [];
        });

      sql = `
        SELECT V.nomination as rowid, COUNT(V.voice) as cnt, SUM(V.voice) as voice
        FROM
          voices AS V
        INNER JOIN nominations AS N
          ON N.rowid = V.nomination
        WHERE
          V.contender = ${con.rowid}
          AND V.voice > 0
          AND N.deleted <> 1
          AND N.active = 1
        GROUP BY
          V.nomination
      `;
      const evaluations = await db.allAsync(sql)
        .catch(err => {
          console.log('--- ERROR3 ', err.message);
          throw new Error(err);
        });
      con.evaluations = [];
      params.nominations.forEach(nom => {
        let found = false;
        evaluations.forEach(eval => {
          if (eval.rowid === nom.rowid) {
            found = true;
            con.evaluations.push((eval.voice / eval.cnt).toFixed(2));
          }
        });
        if (!found) {
          con.evaluations.push(0);
        }
      });
      // console.log('````` evaluations', con.evaluations);

      eval = 0;
      if (voices && voices.length) {
        voices.forEach(voice => {
          eval += (voice.voice / voice.cnt);
          // eval += voice.voice;
        });
        con.average = (eval / voices.length).toFixed(2);
      }
      if (!con.average || con.average < 0) {
        con.average = 0;
      }
    }
    params.contendersList = params.contendersList.sort((a, b) => {
      return b.average - a.average;
    });
  } catch (err) {
    console.error(err.message);
  }

  res.render('layouts/editresults', params);
});

module.exports = router;
