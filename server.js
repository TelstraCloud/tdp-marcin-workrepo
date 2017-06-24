//  OpenShift sample Node application
var express = require('express'),
    fs      = require('fs'),
    app     = express(),
    eps     = require('ejs'),
    morgan  = require('morgan');
    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

var environment = process.env;   

// this is to get the k8s info
const Api = require('kubernetes-client');
const JSONStream = require('json-stream');
const jsonStream = new JSONStream(); 

// determine the cluster host and port
var k8sHost = process.env.KUBERNETES_SERVICE_HOST;
var k8sPort = process.env.KUBERNETES_SERVICE_PORT;
if (!process.env.KUBERNETES_SERVICE_HOST || !process.env.KUBERNETES_SERVICE_PORT) {
  k8sHost = '54.153.181.249.nip.io';
  k8sPort = '8443';
  console.log('env KUBERNETES_SERVICE_HOST or KUBERNETES_SERVICE_PORT not set');
  //console.log(`using https://${k8sHost}:${k8sPort}`);
}
console.log(`Will connect to cluster using https://${k8sHost}:${k8sPort}`);

// read the token from the service account
var token = "";
if (fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token')) {
   token = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8');
}
//console.log("token: " + token);
// this is to get network and OS info
var os = require( 'os' );
var networkInterfaces = os.networkInterfaces( ); //this is an object
var platformname = os.platform(); // this is a string

// mongo connection details
if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
      mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
      mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
      mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
      mongoPassword = process.env[mongoServiceName + '_PASSWORD']
      mongoUser = process.env[mongoServiceName + '_USER'];

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);
  });
};

var calcPrimes = function(n) {
  var t1 = Date.now();
  //var n = 50000000;  //find primes up to n
  var upperbound = Math.floor(Math.sqrt(n)) + 1 ;

  var A = []; //this is all the numbers from 2..n

  for (k = 2; k <= n; k++) {
      A[k] = true;
  } 

  for (i = 2; i < upperbound; i++ ) {
    if (A[i] === true) {
      for (j = i*i; j <= n; j = j + i) {
        A[j] = false;
      }
    }
  }

  var countprimes = 0;

    for (k = 2; k <= n; k++) {
      if (A[k] === true) {
        countprimes++;
      }
  } 
  var totalt = Date.now() - t1;

  return { countPrimes:countprimes,totalTime:totalt};
}

var getK8SInfo = function() {
// connect to the API server

  const core = new Api.Core({
    url: `https://${k8sHost}:${k8sPort}`,
    auth: {
      bearer: token,
    },
    insecureSkipTlsVerify: true,
    version: 'v1',
    namespace: 'ds-policy-test',
  });
  //console.log('connecting to k8s api at ' + core.url);

//const Api = require('kubernetes-client');
  //const core = new Api.Core(Api.config.getInCluster());
  console log('core: ' + JSON.stringify(core))
  return JSON.stringify(core);
}

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('counts');
    var k = getK8SInfo();
    console.log('k = ' + JSON.stringify(k));
    // Create a document with request IP and current time of request
    col.insert({ip: req.ip, date: Date.now()});
    col.count(function(err, count){
      res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
    });
  } else {
    res.render('index.html', { pageCountMessage : null});
  }
});

app.get('/tri', function (req, res) {
  var requested_n = req.query.num;
  var n = 1000;
  if (requested_n) { n = parseInt(requested_n)}
  
  var primesdata = calcPrimes(n);
  res.render('tri.html', { 
                pname : platformname, 
                interfaces: networkInterfaces, 
                totalPrimes: primesdata.countPrimes, 
                totalTime: primesdata.totalTime,
                n: n })
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
