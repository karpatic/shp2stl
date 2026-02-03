<?php

exit;

// THIS IS ALL JS. IT NEEDS TO BE NOT CLIENT SIDE. API KEYS.

// https://www.slant3d.com/slant-3d-printing-api
// https://api-fe-two.vercel.app/Docs
// https://github.com/Florida-foilers/slant3d-api/blob/main/README.md
// https://discord.com/channels/1221837587367460946/1221843458776371210

const apiKeyValue = "sl-7d68de2f36a80276b617d4f8e352e8d2564135b39132772a0c662d07a9a57416";
let endpoint = 'https://www.slant3dapi.com/api/slicer'; 

const fileData = {
  filename: 'cableholder',
  fileURL: 'https://api.charleskarpati.com/maptobox/cableholder.stl',
  quantity: '1',
  color: 'black'
};

const customerDetails = {
  name: 'Charles Karpati',
  email: 'support@feelsgoodgoods.com',
  phone: '3013004728',
  address: '5331 Pooks Hill Road',
  city: 'Bethesda',
  state: 'Maryland',
  zip: '20814'
};
let orderNumber = '123';
let orderSKU = fileData.filename + fileData.color + orderNumber;

const orderData = {
  email: customerDetails.email,
  phone: customerDetails.phone,
  name: customerDetails.name,
  orderNumber: orderNumber,
  filename: fileData.filename,
  fileURL: fileData.fileURL,
  bill_to_street_1: customerDetails.address,
  bill_to_street_2: '',
  bill_to_street_3: '',
  bill_to_city: customerDetails.city,
  bill_to_state: customerDetails.state,
  bill_to_zip: customerDetails.zip,
  bill_to_country_as_iso: 'US',
  bill_to_is_US_residential: 'true',
  ship_to_name: customerDetails.name,
  ship_to_street_1: customerDetails.address,
  ship_to_street_2: '',
  ship_to_street_3: '',
  ship_to_city: customerDetails.city,
  ship_to_state: customerDetails.state,
  ship_to_zip: customerDetails.zip,
  ship_to_country_as_iso: 'US',
  ship_to_is_US_residential: 'true',
  order_item_name: fileData.filename,
  order_quantity: fileData.quantity,
  order_image_url: 'https://feelsgoodgoods.com/feelsgood.png',
  order_sku: orderSKU,
  order_item_color: fileData.color
};
(async () => {
  
  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "api-key": apiKeyValue,
      "Content-Type": 'application/json'
    },
    body: JSON.stringify({ fileURL: fileData.fileURL })
  });
  let resp = await res.json();
  let price = resp.data.price;
  console.log('Slicer price: ', price);

  if (price > 25) { return }

  endpoint = 'https://www.slant3dapi.com/api/order/estimate';
  res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "api-key": apiKeyValue,
      "Content-Type": 'application/json'
    },
    body: JSON.stringify(orderData)
  });
  resp = await res.json(); 
  // console.log(resp.error.message)
  console.log('Total price: ', resp.totalPrice);
  // console.log(resp.error.message[0].params)

  if (price > 10) { return }

  console.log(JSON.stringify(orderData))
  
  endpoint = 'https://www.slant3dapi.com/api/order'
  res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "api-key": apiKeyValue,
      "Content-Type": 'application/json'
    },
    body: JSON.stringify(
      orderData
      // {"email":"support@feelsgoodgoods.com","phone":"3013004728","name":"Charles Karpati","orderNumber":"123","filename":"cableholder","fileURL":"https://api.charleskarpati.com/maptobox/cableholder.stl","bill_to_street_1":"5331 Pooks Hill Road","bill_to_street_2":"","bill_to_street_3":"","bill_to_city":"Bethesda","bill_to_state":"Maryland","bill_to_zip":"20814","bill_to_country_as_iso":"US","bill_to_is_US_residential":"true","ship_to_name":"Charles Karpati","ship_to_street_1":"5331 Pooks Hill Road","ship_to_street_2":"","ship_to_street_3":"","ship_to_city":"Bethesda","ship_to_state":"Maryland","ship_to_zip":"20814","ship_to_country_as_iso":"US","ship_to_is_US_residential":"true","order_item_name":"cableholder","order_quantity":"1","order_image_url":"https://feelsgoodgoods.com/feelsgood.png","order_sku":"cableholderblack123","order_item_color":"black"}
    )
  });
  resp = await res.json();
  console.log('Order:', resp);
  console.log(resp.error.message)
  

  // write order number to txt file
  const fs = require('fs');
  // fs.writeFileSync('orderNumber.txt', JSON.stringify(resp));
  
})();


?>