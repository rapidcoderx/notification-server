const express = require('express');
const bodyParser = require('body-parser');
const {LRUCache} = require('lru-cache');
require('dotenv').config();

/**
 * Creates an instance of the Express application.
 *
 * @returns {object} The Express application object.
 *
 * @example
 * const app = express();
 */
const app = express();
app.use(bodyParser.json());

/**
 * Initializes a new LRUCache with default options.
 *
 * @returns {LRUCache} The initialized LRUCache instance.
 */
const initCache = () => {
    const options = {
        max: 500,
        maxSize: 5000,
        ttl: 1000 * 60 * 15,
        allowStale: false,
        updateAgeOnGet: false,
        updateAgeOnHas: false,
    }
    return new LRUCache(options);
}

/**
 * Initializes a cache.
 *
 * @returns {Object} The initialized cache object.
 */
const cache = initCache();
/**
 * Represents the current data key.
 *
 * @type {number}
 * @name currentDataKey
 * @description This variable stores the current data key value.
 */
let currentDataKey = 0;

/**
 * Sorts an array of objects by the 'timestamp' property in descending order.
 *
 * @param {Array} values - The array of objects to be sorted.
 * @return {Array} - The sorted array of objects.
 */
const sortByTimestamp = (values) => {
    values.sort((a, b) => {
        return b['timestamp'] - a['timestamp'];
    });
    return values;
}

/**
 * Store data in cache.
 *
 * @param {string|number} key - The key to identify the data in the cache.
 * @param {*} data - The data to be stored in the cache.
 * @returns {void}
 */
const storeDataInCache = (key, data) => {
    cache.set(key, {data: data, timestamp: Date.now()});
}

app.post('/data', (req, res) => {
    currentDataKey++;
    storeDataInCache(currentDataKey, req.body);
    res.status(201).json({message: 'Data has been stored successfully'});
});

app.get('/data', (req, res) => {
    let values = [];
    cache.forEach((val) => {
        values.push(val);
    });
    res.json(sortByTimestamp(values).map(val => val.data));
});

/**
 * The PORT variable represents the port number on which the application will listen.
 * If the process.env.PORT environment variable is defined, PORT will be set to its value.
 * Otherwise, PORT will default to 3000.
 *
 * @type {number}
 *
 * @example
 * // Set PORT to 8080 if process.env.PORT is defined, otherwise set it to 3000.
 * const PORT = process.env.PORT || 3000;
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started at port ${PORT}`));