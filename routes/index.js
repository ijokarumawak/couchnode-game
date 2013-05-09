
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('index', { title: 'Couchbase Node.js Game' });
};
