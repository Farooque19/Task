const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const { Parser } = require('json2csv');
const path = require('path');
const isUrl = require('is-url');

const filePath = path.join(__dirname, 'client_data.csv');

function isShopifyDomain(domain) {
    return domain && domain.includes('myshopify.com');
}

async function isPasswordProtected(domain) {
    try {
        domain = domain.startsWith('http') ? domain : `https://${domain}`;
        if(isUrl(domain)){
            const response = await axios.get(domain, {
                validateStatus: function (status) {
                    return status < 500;
                },
                maxRedirects: 0 
            });
    
            if (response.status === 403) {
                return 'TRUE';
            }
    
            if (response.status === 302 || response.status === 301) {
                const redirectLocation = response.headers.location;
                if (redirectLocation && redirectLocation.includes('password')) {
                    return 'TRUE';
                }
            }
        }else{
            return 'FALSE';
        }

        return 'FALSE';
    } catch (error) {
        if (error.response && error.response.status === 403) {
            return 'TRUE';
        } else if (error.response && (error.response.status === 302 || error.response.status === 301)) {
            const redirectLocation = error.response.headers.location;
            if (redirectLocation && redirectLocation.includes('password')) {
                return 'TRUE';
            }
        } else {
            console.log(`Error occurred while checking password protection: ${error.message}`);
            return 'FALSE';
        }
    }
}

async function getPoweredByHeader(domain) {
    try {
        if (isUrl(domain)) {
            const response = await axios.get(domain, {
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            const poweredByHeader = response.headers['powered-by'];
            return poweredByHeader === 'Shopify';
        }
        return false;
    } catch (error) {
        return `Request failed: ${error.message}`;
    }
}

async function isShopify(domain) {
    return await getPoweredByHeader(domain);
}

async function checkShopifyStatus(domain) {
    try {
        domain = domain.startsWith('http') ? domain : `https://${domain}`;
        const response = await axios.get(domain, {
            validateStatus: function (status) {
                return status < 500;
            }
        });

        if (response.status === 200) {
            return 'TRUE';
        } else if (response.status === 404 || response.status === 403 || response.status === 503 || response.status === 402) {
            return 'FALSE';
        }
        return 'TRUE';
    } catch (error) {
        return 'FALSE';
    }
}

function generateSummaryStats(results) {
    const total = results.length;
    const shopifyCount = results.filter(r => r.isShopify === 'TRUE').length;
    const nonShopifyCount = total - shopifyCount;
    const activeCount = results.filter(r => r.isActive === 'TRUE').length;
    const nonActiveCount = total - activeCount;
    const activePassword = results.filter(r => r.isPasswordProtected === 'TRUE').length;
    const nonActivePassword = total - activePassword;

    return {
        total,
        shopifyCount,
        nonShopifyCount,
        activeCount,
        nonActiveCount,
        activePassword,
        nonActivePassword,
    };
}

const processCSV = async () => {
    const results = [];
    const promises = []; // Store all promises here

    const start = Date.now();
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
            const clientDomain = data.Client_Domain ? data.Client_Domain.trim() : '';

            const promise = (async () => {
                const isShopifyVal = await isShopify(clientDomain);
                const isPassword = await isPasswordProtected(clientDomain);

                data.isShopify = (isShopifyDomain(clientDomain) || isShopifyVal) ? 'TRUE' : 'FALSE';
                data.isPasswordProtected = isPassword;
                return data;
            })();

            promises.push(promise);
        })
        .on('end', async () => {
            // Wait for all promises to resolve
            const resolvedResults = await Promise.all(promises);

            if (resolvedResults.length === 0) {
                console.error('No data found in the CSV file.');
                return; 
            }

            // Check the status for Shopify domains
            for (const result of resolvedResults) {
                result.isActive = await checkShopifyStatus(result.Client_Domain);
            }

            const stats = generateSummaryStats(resolvedResults);
            console.log('Summary Statistics:', stats);

            resolvedResults.push({
                Client_Domain: 'Total Number of Data',
                isShopify: stats.total,
                isActive: '',
                isPasswordProtected: ''
            });
            resolvedResults.push({
                Client_Domain: 'Total Shopify Domains',
                isShopify: stats.shopifyCount,
                isActive: '',
                isPasswordProtected: ''
            });
            resolvedResults.push({
                Client_Domain: 'Total Non-Shopify Domains',
                isShopify: stats.nonShopifyCount,
                isActive: '',
                isPasswordProtected: ''
            });
            resolvedResults.push({
                Client_Domain: 'Total Active Domains',
                isShopify: '',
                isActive: stats.activeCount,
                isPasswordProtected: ''
            });
            resolvedResults.push({
                Client_Domain: 'Total Non-Active Domains',
                isShopify: '',
                isActive: stats.nonActiveCount,
                isPasswordProtected: ''
            });
            resolvedResults.push({
                Client_Domain: 'Total Password-Protected Domains',
                isShopify: '',
                isActive: '',
                isPasswordProtected: stats.activePassword
            });
            resolvedResults.push({
                Client_Domain: 'Total Non-Password-Protected Domains',
                isShopify: '',
                isActive: '',
                isPasswordProtected: stats.nonActivePassword
            });

            // Get all existing fields from the results
            const fields = Object.keys(resolvedResults[0]);

            // Convert the JSON result to CSV, keeping the original columns intact
            const json2csvParser = new Parser({ fields });
            const csvData = json2csvParser.parse(resolvedResults);

            // Overwrite the existing CSV file with the populated data
            fs.writeFileSync(filePath, csvData);

            const end = Date.now();
            console.log(end - start + ' milliseconds');
            console.log('CSV file processed and overwritten successfully, with existing columns populated.');
        })
        .on('error', (error) => {
            console.error('Error reading CSV file:', error);
        });
};

// Call the function to process and overwrite the CSV file
processCSV();
