const express = require('express');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const app = express();
const csrfProtection = require('csurf')({ cookie: true });
const logger = require('./utils/logger');
const path = require('path');
const { redis, config, keys, scraper } = require('./routes/instances');

const execAll = async () => {
	await Promise.all([
		scraper.getWorldometerPage(keys, redis),
		scraper.getStates(keys, redis),
		scraper.jhuLocations.jhudataV2(keys, redis),
		scraper.historical.historicalV2(keys, redis),
		scraper.historical.getHistoricalUSADataV2(keys, redis)
	]);
	logger.info('Finished scraping!');
	app.emit('scrapper_finished');
};

const execNyt = () => scraper.nytData(keys, redis);

execAll();
execNyt();

// Update Worldometer and Johns Hopkins data every 10 minutes
setInterval(execAll, config.interval);
// Update NYT data every hour
setInterval(execNyt, config.nyt_interval);

app.get('/invite', async (req, res) =>
	res.redirect('https://discordapp.com/oauth2/authorize?client_id=685268214435020809&scope=bot&permissions=537250880')
);

app.get('/support', async (req, res) => res.redirect('https://discord.gg/EvbMshU'));

app.use(require('./routes/api_worldometers'));
app.use(require('./routes/api_historical'));
app.use(require('./routes/api_jhucsse'));
app.use(require('./routes/api_deprecated'));

app.use(require('cors')());
app.use(express.static('public'));
app.use('/docs',
	swaggerUi.serve,
	swaggerUi.setup(null, {
		explorer: true,
		customSiteTitle: 'NovelCOVID 19 API',
		customfavIcon: '/public/virus.png',
		customCssUrl: '/public/apidocs/custom.css',
		swaggerOptions: {
			urls: [
				{
					name: 'version 2.0.0',
					url: '/public/apidocs/swagger_v2.json'
				},
				{
					name: 'version 1.0.0',
					url: '/public/apidocs/swagger_v1.json'
				}
			]
		}
	})
);

app.set('views', path.join(__dirname, '/public'));
app.set('view engine', 'ejs');
app.use(require('cookie-parser')());

app.get('/', csrfProtection, async (req, res) => res.render('index', { csrfToken: req.csrfToken() }));

app.post('/private/mailgun', require('body-parser').urlencoded({ extended: true }), csrfProtection, async (req, res) => {
	const { email } = req.query;
	console.log(email);
	const DOMAIN = 'lmao.ninja';
	const mailgun = require('mailgun-js')({ apiKey: config.mailgunApiKey, domain: DOMAIN });
	const list = mailgun.lists(`updates@${DOMAIN}`);
	const newMember = {
		subscribed: true,
		address: email
	};
	list.members().create(newMember, (error, data) => {
		console.log(data);
	});
	// if (response.status === 200) {
	// 	res.send(response.data);
	// } else {
	// 	// return some kinda of error if you like
	// 	res.send(response.error);
	// }
});

app.use(require('./routes/api_worldometers'));
app.use(require('./routes/api_historical'));
app.use(require('./routes/api_jhucsse'));
app.use(require('./routes/api_deprecated'));
app.use(require('./routes/api_nyt'));

app.listen(config.port, () =>
	logger.info(`Your app is listening on port ${config.port}`)
);

module.exports = app;
