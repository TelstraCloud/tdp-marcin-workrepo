//  OpenShift sample Node application
var express = require('express'),
    fs      = require('fs'),
    app     = express(),
    eps     = require('ejs'),
    request = require('request'),
    morgan  = require('morgan');
    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

var environment = process.env;   

var test_output_global;

const nodeMap = {
  "ip-172-31-32-19.ap-southeast-2.compute.internal" : "DC1",
  "ip-172-31-33-133.ap-southeast-2.compute.internal": "AZ1",
  "ip-172-31-38-70.ap-southeast-2.compute.internal" : "AZ2",
  "ip-172-31-42-224.ap-southeast-2.compute.internal": "DC2"
};

var myDetails; // = getMyDetails();

function getMyDetails() {
  var project_namespace = process.env.OPENSHIFT_BUILD_NAMESPACE;
  var hostname = process.env.HOSTNAME;

  if (hostname && project_namespace) {
    var url = `http://tdp-api-tdp.54.153.181.249.nip.io/projects/${project_namespace}/pods`;
    console.log("getting TDP API at: " + url);
    var project_info;

    request(url, function(err,res,body){
      if (res.statusCode === 200) {
            project_info = body;
            //console.log("project_info: " + project_info);

            var project = JSON.parse(project_info);
            var pod;

            for (i=0; i<project.pods.length; i++){
              if (project.pods[i].metadata.name === hostname) {
                pod = project.pods[i];
                break;
              }
            };
            if (!pod) { return defaultDetails();};

            var node = pod.spec.nodeName;

            var output = {
              zone: nodeMap[node],
              node: node,
              hostname: hostname,
              project: project_namespace
            };

            console.log("output:\n" + JSON.stringify(output,null,4) );
            myDetails = output; //lets make it global
            return;// output;

      } else {
        console.log("error retreiving TDP-API info: " + err);
        console.log("response status code: " + res.statusCode)
        return defaultDetails();
      }
    });

  };

  if (! (hostname && project_namespace /*&& project_info*/)) {
    // then something went wrong so we need to make up data
    console.log("something went wrong getting project_info OR ENV vars not set")
    return defaultDetails();
  };

  

}; //end getMyDetails()

function defaultDetails() {
  // this is what we send back if there's no pod info or we can't connect to the API or can't find env vars
  myDetails =  {
    zone: "UNK",
    node: "unknown node",
    hostname: "unknown host",
    project: "unknown project"
  };
  return;
}

getMyDetails();


console.log("myDetails:\n " + JSON.stringify(myDetails,null,4));


// this is to get network and OS info
var os = require( 'os' );
var networkInterfaces = os.networkInterfaces( ); //this is an object
var platformname = os.platform(); // this is a string

// mongo connection details
if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase().replace(/-/g,'_'),
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



app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('counts');
    
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
                details: myDetails,
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
      res.send('{"pageCount": ' + count + '}');
    });
  } else {
    res.send('{"pageCount": -1 }');
  }
});


app.get('/setprime', function (req, res) {
  var requested_n = req.query.num;
  var n = 3;
  if (requested_n) { n = parseInt(requested_n)}

  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('primes');
    
    // Create a document with request IP and current time of request
    col.insert({date: Date.now(), n});

    var lastprimes;
    col.find().sort({date:-1}).limit(10).toArray(function(err, docs) {
      lastprimes = docs;  
    };
    console.log("lastprimes: " + JSON.stringify(lastprimes,null,4));
    //col.count(function(err, count){
    //  res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
    //});
    res.send(JSON.stringify(lastprimes,null,4));
  } else {
    res.send('{"primes" : 0}');
  }


  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{"pageCount": ' + count + '}');
    });
  } else {
    res.send('{"pageCount": -1 }');
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
