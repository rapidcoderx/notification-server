require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const {LRUCache} = require('lru-cache');
const path = require('path');
const amqp = require('amqplib');
const app = express();

app.use(bodyParser.json());

// RabbitMQ's connection details with TLS
const rabbitMQOptions = {
    protocol: process.env.RABBITMQ_PROTOCOL,
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    password: process.env.RABBITMQ_PASSWORD,
    locale: process.env.RABBITMQ_LOCALE,
    frameMax: process.env.RABBITMQ_FRAME_MAX,
    heartbeat: process.env.RABBITMQ_HEARTBEAT
};

//Initial connect to RabbitMQ and channel create
const AMQP_CONNECTION_STRING = `amqps://${rabbitMQOptions.username}:${rabbitMQOptions.password}@${rabbitMQOptions.hostname}:${rabbitMQOptions.port}`;

const exchangeName = process.env.EXCHANGE_NAME || 'core';
const topicName = process.env.TOPIC_NAME || 'banking';
const SUCCESS_MESSAGE = 'Message published to RabbitMQ';
const FAILURE_MESSAGE = 'Failed to publish message to RabbitMQ';
let channel = null;

const setupRabbitMQ = async () => {
    try {
        const connection = await amqp.connect(AMQP_CONNECTION_STRING);
        const currentChannel = await connection.createChannel();

        await currentChannel.assertExchange(exchangeName, 'topic', {durable: true});

        channel = currentChannel;

        console.log('Connected to RabbitMQ successfully.');
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
    }
};

(async () => {
    await setupRabbitMQ();
    await consumeFromRabbitMQ();
    // The rest of your application code here...
})().catch(error => console.error(`An error occurred while setting up the application: ${error.message}`));

const measureExecutionTime = (func) => {
    const startTime = Date.now();
    func();
    return Date.now() - startTime;
};

const sendJsonResponse = (res, status, message, error) => {
    const responseContent = error
        ? {status, message, error: error.message}
        : {status, message};
    const statusCode = status === 'success' ? 200 : 500;

    res.status(statusCode).json(responseContent);
};

// Express endpoint to receive a message and publish it to RabbitMQ
const publishToRabbitMQ = (channel, exchangeName, topicName, bufferContent) => {
    channel.publish(exchangeName, topicName, bufferContent);
};

const publishMessage = async (req, res) => {

    const bufferContent = Buffer.from(JSON.stringify(req.body));

    const executeAndMeasureTime = () => {
        if (channel) {
            publishToRabbitMQ(channel, exchangeName, topicName, bufferContent);
        } else {
            console.error('Failed to publish message to RabbitMQ due to connection error');
            sendJsonResponse(res, 'failure', FAILURE_MESSAGE, {message: 'Connection error'});
        }
    };

    const elapsedTime = measureExecutionTime(executeAndMeasureTime);

    res.set('Processing-Time', `${elapsedTime}ms`);
    sendJsonResponse(res, 'success', SUCCESS_MESSAGE);
};

const initLRUCache = () => {
    const cacheOptions = {
        max: 500,
        ttl: 1000 * 60 * 15,
        allowStale: false,
        updateAgeOnGet: false,
        updateAgeOnHas: false,
    };

    return new LRUCache(cacheOptions);
};

const cache = initLRUCache();
let currentDataKey = 1;

const sortByTimestamp = (values) => Array.isArray(values) ? values.sort((a, b) => b['timestamp'] - a['timestamp']) : [];

const consumeFromRabbitMQ = async () => {
    // Ensure the topic queue exists
    let queue = await channel.assertQueue('', {exclusive: true});
    channel.bindQueue(queue.queue, exchangeName, topicName);
    channel.consume(queue.queue, (data) => {
        let message = JSON.parse(data.content);
        Object.assign(message, { key: currentDataKey++ });
        storeDataInCache(message.key.toString(), message);
        channel.ack(data);
    }, {noAck: false});
};

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


app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.post('/api/publish', publishMessage);

app.post('/api/data', (req, res) => {
    Object.assign(req.body, {key: currentDataKey++});
    storeDataInCache(req.body.key.toString(), req.body);
    res.status(201).json({message: 'Data stored successfully'});
});

app.get('/api/data', (req, res) => {
    let cacheKeys = Array.from(cache.keys());
    let mappedValues = Array.from(cache.values()).map((value, index) => mapValuesWithTimestamp(value, cacheKeys[index]));
    res.json(sortByTimestamp(mappedValues));
});

app.get('/api/view', (req, res) => {
    let cacheKeys = Array.from(cache.keys());
    let mappedValues = Array.from(cache.values()).map((value, index) => mapValuesWithTimestamp(value, cacheKeys[index]));
    let sortedValues = sortByTimestamp(mappedValues);
    res.render('data', {values: sortedValues.slice(-15)});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started at port ${PORT}`));