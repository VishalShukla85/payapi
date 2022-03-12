const express = require("express");
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const https = require("https");
const qs = require("querystring");
const ejs = require('ejs');
const checksum_lib = require("./Paytm/checksum");
const config = require("./Paytm/config");
var tempuid;
var tempamount;
console.log(tempuid);
const app = express();
app.use(express.static(__dirname + "/views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, 'front')));
const parseUrl = express.urlencoded({ extended: true });
const parseJson = express.json({ extended: true });
const { response, json } = require('express')
const PORT = process.env.PORT || 3000;
app.use(cors(
  {
    origin: '*',
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200,
  }
));



app.get("/", (req, res) => {
  // let amount = req.query;
  // amount = tempamount;

  res.sendFile("index");


});
// let amounttobepaid;

app.get("/paynow", [parseUrl, parseJson], (req, res) => {
  // Route for making payment
  //  const{amount} = req.query;
  //  totalamount = amount;
  let amount = req.query.amount;

  tempamount = amount;

  let uid = req.query.uid;
  tempuid = uid;


  var params = {};
  params['MID'] = config.PaytmConfig.mid;
  params['WEBSITE'] = config.PaytmConfig.website;
  params['CHANNEL_ID'] = 'WEB';
  params['INDUSTRY_TYPE_ID'] = 'Retail';
  params['ORDER_ID'] = 'TEST_' + new Date().getTime();
  params['CUST_ID'] = 'customerId_' + new Date().getTime();
  params['TXN_AMOUNT'] = amount;
  params['CALLBACK_URL'] = `https://localhost:${PORT}/callback`;
  params['EMAIL'] = uid;
  //   params['MOBILE_NO'] = paymentDetails.customerPhone;
  // params.body ={
  //   "TXNToken":{
  //     "amount" : amount,
  //     "currency": "INR"
  //   }
  // }

  checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {
    var txn_url = "https://securegw-stage.paytm.in/theia/processTransaction"; // for staging
    // var txn_url = "https://securegw.paytm.in/theia/processTransaction"; // for production

    var form_fields = "";
    for (var x in params) {
      form_fields += "<input type='hidden' name='" + x + "' value='" + params[x] + "' >";
    }
    form_fields += "<input type='hidden' name='CHECKSUMHASH' value='" + checksum + "' >";

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html><head><title>Merchant Checkout Page</title></head><body><center><h1>Please do not refresh this page...</h1></center><form method="post" action="' + txn_url + '" name="f1">' + form_fields + '</form><script type="text/javascript">document.f1.submit();</script></body></html>');
    res.end();
  });
}

);


app.post("/callback", (req, res) => {
  // Route for verifiying payment

  var body = '';

  req.on('data', function (data) {
    body += data;
  });

  req.on('end', function () {
    var html = ""
    var post_data = qs.parse(body);

    // received params in callback
    console.log('Callback Response: ', post_data, "\n");


    // verify the checksum
    var checksumhash = post_data.CHECKSUMHASH;
    // delete post_data.CHECKSUMHASH;
    var result = checksum_lib.verifychecksum(post_data, config.PaytmConfig.key, checksumhash);
    console.log("Checksum Result => ", result, "\n");


    // Send Server-to-Server request to verify Order Status
    var params = { "MID": config.PaytmConfig.mid, "ORDERID": post_data.ORDERID };

    checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {

      params.CHECKSUMHASH = checksum;
      post_data = 'JsonData=' + JSON.stringify(params);

      var options = {
        hostname: 'securegw-stage.paytm.in', // for staging
        // hostname: 'securegw.paytm.in', // for production
        port: 443,
        path: '/merchant-status/getTxnStatus',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': post_data.length
        }
      };


      // Set up the request
      var response = "";
      var post_req = https.request(options, function (post_res) {
        post_res.on('data', function (chunk) {
          response += chunk;
        });

        post_res.on('end', function () {
          console.log('S2S Response: ', response, "\n");
          post_res.on('end', () => {
            console.log(orderId);
            console.log(MID);
            console.log('Response: ', response);
            response = JSON.parse(response);
            res.send(response.body.txnToken);
            return 0;
          });

          var _result = JSON.parse(response);

          if (_result != null) {

            let tDate = _result.TXNDATE;

            let data = {
              'orderID': _result.ORDERID,
              'tId': _result.TXNID,
              'amount': _result.TXNAMOUNT,
              'tDate': _result.TXNDATE,
              'bname:': _result.BANKNAME,
              'status': _result.RESPMSG,
              'gateway': _result.GATEWAYNAME,
              'bTid': _result.BANKTXNID,
              'status': _result.STATUS,

            }

            db.collection('users').doc(tempuid).collection('payments').doc(tDate).set(data);



            if (_result.STATUS == 'TXN_SUCCESS') {

              var someDate = new Date();
              var numberOfDaysToAdd;

              if (tempamount == "1497") {
                numberOfDaysToAdd = 90;

              } else if (tempamount == "2495") {

                numberOfDaysToAdd = 180;



              } else if (tempamount = "4999") {
                numberOfDaysToAdd = 360
              }


              var tempresult = someDate.setDate(someDate.getDate() + numberOfDaysToAdd);

              var result = new Date(tempresult).toLocaleDateString();

              db.collection('users').doc(tempuid).update({
                'planDate': _result.TXNDATE,
                'currentPlan': tempamount,
                'validTill': result,



              });





            }









          }



          if (_result.STATUS == 'TXN_SUCCESS') {
            res.render('response', { 'data': _result });

            //  res.send('payment sucess '+'payment sucess '+ _result.TXNID+ _result.ORDERID+ _result.TXNAMOUNT+ _result.GATEWAYNAME+
            //   _result.BANKNAME+_result.TXNDATE+ _result.RESPMSG)
            //  const data = response;
            //  User.add(data);
            //  res.send("stored successfully"+ result.TXN_AMOUNT);
          } else {
            res.render('response', { 'data': _result })

          }
          // routes.get('/paymentinfo', {
          //   return: {
          //     "Result" :_result
          //   }
          // })
        });
      });

      // post the data
      post_req.write(post_data);
      post_req.end();
    });
  });
});

app.get('*', (req,res)=>{
  res.render('error');
})


app.listen(PORT, () => {
  console.log(`App is listening on Port ${PORT}`);
});