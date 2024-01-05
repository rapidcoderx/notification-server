const express = require('express');
const bodyParser = require('body-parser');
const {LRUCache} = require('lru-cache');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const initCache = () => {
    const options = {
        max: 500,
        ttl: 1000 * 60 * 15,
        allowStale: false,
        updateAgeOnGet: false,
        updateAgeOnHas: false,
    };

    return new LRUCache(options);
};

const cache = initCache();
let currentDataKey = 1;

const sortByTimestamp = (values) => Array.isArray(values) ? values.sort((a, b) => b['timestamp'] - a['timestamp']) : [];

const storeDataInCache = (key, data) => {
    cache.set(key, {data: data, timestamp: Date.now()});
};

const pad = (number) => {
    return number < 10 ? '0' + number : number;
};

const getLocalTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        '.' + (date.getMilliseconds() / 1000).toFixed(3).slice(2, 5);
};

const mapValuesWithTimestamp = (value, key) => {
    const {luwId, type, subject, businessDate} = value.data;
    return {
        luwId,
        type,
        subject,
        businessDate,
        timestamp: getLocalTimestamp(value.timestamp),
        key: key
    };
};

app.post('/api/data', (req, res) => {
    Object.assign(req.body, {key: currentDataKey++});
    storeDataInCache(req.body.key.toString(), req.body);
    res.status(201).json({message: 'Data stored successfully'});
});

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.get('/api/data', (req, res) => {
    let keys = Array.from(cache.keys());
    let values = Array.from(cache.values()).map((value, index) => mapValuesWithTimestamp(value, keys[index]));
    res.json(sortByTimestamp(values));
});

app.get('/api/view', (req, res) => {
    let keys = Array.from(cache.keys());
    let values = Array.from(cache.values()).map((value, index) => mapValuesWithTimestamp(value, keys[index]));
    let sortedValues = sortByTimestamp(values);
    res.render('data', {values: sortedValues.slice(-15)});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started at port ${PORT}`));