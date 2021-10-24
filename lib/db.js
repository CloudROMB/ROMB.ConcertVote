const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');

// TUTORIAL
// http://www.sqlitetutorial.net/sqlite-nodejs/connect/

async function connectDB() {
  // const dbPath = path.join(__dirname, config.DB.path);
  const dbPath = config.DB.path;
// console.log('dbPath:', dbPath);
  const db = await new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error(err.message);
      process.terminate();
      return null;
    }
    // console.log('Connected to the sqlite.manage database.');
  });

  db.getAsync = function (sql) {
    const that = this;
    return new Promise(function (resolve, reject) {
      that.get(sql, function (err, row) {
        if (err)
          reject(err);
        else
          resolve(row);
      });
    });
  };

  db.allAsync = function (sql) {
    const that = this;
    return new Promise(function (resolve, reject) {
      that.all(sql, function (err, rows) {
        if (err) {
          reject(err);
          // console.error('Error allAsync:', err.message);
          // resolve([]);
        } else {
          resolve(rows);
        }
      });
    });
  };

  db.runAsync = function (sql) {
    const that = this;
    return new Promise(function (resolve, reject) {
      that.run(sql, function (err) {
        if (err)
          reject(err);
        else
          resolve();
      });
    })
  };

  db.insertAsync = function (sql) {
    const that = this;
    return new Promise(function (resolve, reject) {
      that.run(sql, function (err) {
        if (err)
          reject(err);
        else
          resolve(this.lastID);
      });
    })
  };

  db.updateAsync = function (sql) {
    const that = this;
    return new Promise(function (resolve, reject) {
      that.run(sql, function (err) {
        if (err)
          reject(err);
        else
          resolve(this.changes);
      });
    })
  };

  db.getValue = async function (key) {
    const that = this;
    return new Promise(function (resolve, reject) {
      const sql = `SELECT val FROM "config" WHERE key="${key}"`;
      console.log('SQL:', sql);
      that.get(sql, [], function (err, row) {
        if (err)
          reject(err);
        else
        // resolve(row.value);
        if (row)
          resolve(decodeURIComponent(row.val));
        else
          resolve(row);
      });
    })
      .catch(err => {
        console.error('ERROR getValue:', err.message);
      });
  };

  db.setValue = function (key, val) {
    const that = this;
    return new Promise(function (resolve, reject) {
      let sql, dbres;
      sql = `SELECT val FROM "config" WHERE key="${key}"`;
      console.log('SQL:', sql);
      that.get(sql, [], async function (err, row) {
        if (err)
          reject(err);
        else if (row) {
          sql = `UPDATE config SET val="${encodeURIComponent(val)}" WHERE key="${key}"`;
          console.log('SQL:', sql);
          dbres = await db.updateAsync(sql);
          if (!dbres)
            reject();
          else
            resolve(dbres);
          // db.run(`UPDATE config SET val=(?) WHERE key='(?)'`, [val, key], (err) => {
          //   if (err)
          //     reject(err);
          //   else
          //     resolve(this.changes);
          // });
        } else {
          sql = `INSERT INTO config (key, val) VALUES ("${key}", "${encodeURIComponent(val)}")`;
          console.log('SQL:', sql);
          dbres = await db.insertAsync(sql);
          if (!dbres)
            reject();
          else
            resolve(dbres);

          // db.run(`INSERT INTO config (key, val) VALUES (?, ?)`, [key, val], (err) => {
          //   if (err)
          //     reject(err);
          //   else
          //     resolve(this.lastID);
          // });
        }
      });
    })
      .catch(err => {
        console.error('ERROR setValue:', err.message);
      });
  };

  return db;
}

async function prepareDB(db) {
  let res;

  await db.runAsync(`DROP TABLE IF EXISTS nominations`);
  console.error('+ DROP TABLE nominations');
  await db.runAsync(`CREATE TABLE IF NOT EXISTS nominations (
        rowid INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        evaluations TEXT,
        uniquevoices TEXT,
        active INTEGER,
        deleted INTEGER DEFAULT 0
      )`);
  console.error('+ CREATE TABLE nominations');
  await db.runAsync(
    `INSERT INTO nominations (name, evaluations, uniquevoices, active)
    VALUES (("Номинация «Танцевальный профессионализм»"),
    ("[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"),
    ("[10, 12]"), (1))`);
  console.error('+ Inserted nominations');
  await db.runAsync(`
    INSERT INTO nominations
      (name, evaluations, uniquevoices, active)
    VALUES
      ("Номинация «Лучший вокал»", "[1, 2, 3, 4, 5]", "[10, 12]", 0)`);
  console.error('+ Inserted nominations');

  await db.runAsync(`DROP TABLE IF EXISTS config`);
  await db.runAsync(`CREATE TABLE IF NOT EXISTS config
      (rowid INTEGER PRIMARY KEY, key TEXT NOT NULL, val TEXT)`);
  res = await db.insertAsync(`
    INSERT INTO config
      (key, val)
    VALUES
      ("contest", "Детское Евровидение 2018")`);
  console.log('+ Inserted contest:', res);
  res = await db.getAsync(`SELECT val FROM config WHERE key="contest"`);
  console.log('+ SELECT contest:', res);

  res = await db.insertAsync(`
    INSERT INTO config
      (key, val)
    VALUES
      ("voteActive", 1)`);
  console.log('+ Inserted voteActive:', res);
  res = await db.getAsync(`SELECT val FROM config WHERE key="voteActive"`);
  console.log('+ SELECT voteActive:', res);

  await db.runAsync(`DROP TABLE IF EXISTS users`);
  await db.runAsync(`
      CREATE TABLE IF NOT EXISTS users
        (rowid INTEGER PRIMARY KEY,
        login TEXT NOT NULL,
        pass TEXT NOT NULL,
        position TEXT,
        credentials TEXT,
        name TEXT,
        about TEXT,
        photo TEXT,
        country TEXT,
        countryshort TEXT,
        city TEXT,
        deleted INTEGER DEFAULT 0)
      `);
  res = await db.insertAsync(`
    INSERT INTO users (login, pass, name, credentials)
    VALUES
    ("admin", "admin", "Администратор", '["admin", "jury"]')`);
  console.error('USER inserted', res);

  await db.runAsync(`DROP TABLE IF EXISTS contenders`);
  await db.runAsync(`CREATE TABLE IF NOT EXISTS contenders (
      rowid INTEGER PRIMARY KEY,
      country TEXT,
      countryshort TEXT,
      city TEXT,
      name TEXT NOT NULL,
      action TEXT NOT NULL,
      age INTEGER,
      about TEXT,
      photo TEXT,
      active INTEGER,
      education TEXT,
      hobby TEXT,
      deleted INTEGER DEFAULT 0
      )`);

  await db.runAsync(`DROP TABLE IF EXISTS voices`);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS voices (
      rowid INTEGER PRIMARY KEY,
      contender INTEGER,
      nomination INTEGER,
      user INTEGER,
      voice REAL
    )`);
}

async function prepareDB_ext(db) {
  let res;

  await db.runAsync(`ALTER TABLE contenders ADD COLUMN deleted INTEGER DEFAULT 0`);
}

// db.close((err) => {
//   if (err) {
//     console.error(err.message);
//   }
//   console.log('Close the database connection.');
// });

module.exports.connectDB = connectDB;
module.exports.prepareDB = prepareDB;
module.exports.prepareDB_ext = prepareDB_ext;
