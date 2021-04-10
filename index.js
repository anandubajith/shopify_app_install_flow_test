const fastify = require('fastify')({
    logger: true
});

const { Liquid } = require('liquidjs')
const path = require('path')
const engine = new Liquid({
    root: path.join(__dirname, 'templates'),
    extname: '.liquid'
})

fastify.register(require('point-of-view'), {
    engine: {
        liquid: engine
    }
});

const crypto = require('crypto');
const querystring = require('querystring');
const nonce = require('nonce')();
const got = require('got');
require('dotenv').config()

const CONFIG = {
    baseUrl: process.env.BASE_URL,
    shopifyApiKey: process.env.SHOPIFY_API_KEY,
    shopifyApiSecret: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES.split(' ')
}

fastify.get('/', function (request, reply) {
    reply.view('./templates/index.liquid', {})
})

fastify.get('/install', function (request, reply) {
    const shopName = request.query.shop; // Shop Name passed in URL

    if (shopName) {
        const redirectUri = CONFIG.baseUrl + '/callback'; // Redirect URI for shopify Callback
        const installUri = 'https://' + shopName +
            '/admin/oauth/authorize?client_id=' + CONFIG.shopifyApiKey +
            '&scope=' + CONFIG.scopes +
            '&state=' + nonce() +
            '&redirect_uri=' + redirectUri; // Install URL for app install

        reply.redirect(302, installUri);
    } else {
        return reply.status(400).send('Missing shop parameter. Please add ?shop=storilabs.myshopify.com to your request');
    }
})

fastify.get('/callback', async function (request, reply) {
    try {
        const {
            shop,
            hmac,
            code,
            shopState
        } = request.query;

        // console.log(request.query)
        // const stateCookie = cookie.parse(request.headers.cookie).state;
        // console.log(shopState + stateCookie);
        // if (shopState !== stateCookie) {
        //     return reply.status(403).send('Request origin cannot be verified');
        // }

        console.log(shop, code);

        if (shop && code) {
            const map = Object.assign({}, request.query);
            delete map['signature'];
            delete map['hmac'];
            const message = querystring.stringify(map);
            const providedHmac = Buffer.from(hmac, 'utf-8');
            const generatedHash = Buffer.from(
                crypto
                    .createHmac('sha256', CONFIG.shopifyApiSecret)
                    .update(message)
                    .digest('hex'),
                'utf-8'
            );

            let hashEquals = false;
            try {
                hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
            } catch (e) {
                hashEquals = false;
            };
            if (!hashEquals) {
                return reply.status(400).send('HMAC validation failed');
            }
            
            const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
            const { body } = await got.post(accessTokenRequestUrl, {
                json: {
                    client_id: CONFIG.shopifyApiKey,
                    client_secret: CONFIG.shopifyApiSecret,
                    code,
                },
                responseType: 'json'
            });

            console.log(body)
            return reply.view('./templates/success.liquid', body)

        } else {
            reply.status(400).send('Required parameters missing');
        }
    } catch ( e) {
        console.error(e)
        reply.redirect(302, CONFIG.baseUrl);
    }
 
});


fastify.listen(3000, function (err, address) {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
    fastify.log.info(`server listening on ${address}`)
})