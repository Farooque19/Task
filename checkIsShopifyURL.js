const isUrl = require('is-url');
const axios = require('axios');

async function getPoweredByHeader(domain) {
    try {
        if (isUrl(domain)) {
            const start = Date.now();
            const response = await axios.get(domain, {
                validateStatus: function (status) {
                    return status < 500;
                },
                tmeout: 5000,
                maxRedirects: 5,
                
            });
            console.log(response.status);
            const end = Date.now();
            console.log(end - start);
            const poweredByHeader = response.headers['powered-by'];
            return poweredByHeader === 'Shopify';
        }
        return false;
    } catch (error) {
        if(error.response){
            const poweredByHeader = error.response.headers['powered-by'];
            if(poweredByHeader && poweredByHeader === 'Shopify'){
                return true;
            }
        }
        return false;
    }
}

async function isURL (){
    let domain = 'hbdropnscoop.com';
    domain = domain.startsWith('http') ? domain : `https://${domain}`;
    console.log(domain);
    const result = await getPoweredByHeader(domain);
    console.log(result);
}

isURL();