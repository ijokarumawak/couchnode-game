var driver = require('couchbase');
var config = require('config');
var util = require('util');
var async = require('async');
var fs = require('fs');
var cb;

// Syntax sugar.
function isErr(err, callback){
  if(err) {
    callback(err);
    return true;
  }
  return false;
}

console.log('Connecting to Couchbase.');
driver.connect(config.Couchbase.connection, function(err, _cb){
  if(err) throw (err);
  cb = _cb;
  console.log('Established a connection to Couchbase.');

  // load monsters.
  fs.readdir('monsters', function(err, files){
    if(err) throw err;
    files.forEach(function(file){
      fs.readFile('monsters/' + file, 'utf8', function(err, data){
        if(err) throw err;
        json = JSON.parse(data);
        var id = 'Monster-' + file.replace('.json', '');
        json.type = 'Monster';
        json.id = id;
        console.log(json);
        cb.set(id, json, function(err){
          if(err) throw err;
        });
      });
    });
  });
});
