#!/usr/bin/env node

/**
 * Deployment Validator
 * Tests a deployed MCP server to ensure it's working correctly
 */

const baseUrl = process.argv[2];

if (!baseUrl) {
    console.error('Usage: node validate-deployment.js <deployment-url>');
    console.error('Example: node validate-deployment.js https://mcp-abc12345.railway.app');
    process.exit(1);
}

async function validateDeployment(url) {
    console.log('🔍 Validating MCP deployment...\n');
    console.log(`URL: ${url}\n`);

    const tests = [];

    // Test 1: Health Check
    console.log('1️⃣  Testing health endpoint...');
    try {
        const response = await fetch(`${url}/health`);
        const data = await response.json();
        
        if (data.status === 'ready') {
            console.log('✅ Health check passed');
            console.log(`   Status: ${data.status}, Uptime: ${data.uptime}s\n`);
            tests.push(true);
        } else {
            console.log('⚠️  Server not ready yet');
            console.log(`   Status: ${data.status}\n`);
            tests.push(false);
        }
    } catch (error) {
        console.log('❌ Health check failed');
        console.log(`   Error: ${error.message}\n`);
        tests.push(false);
    }

    // Test 2: List Tools
    console.log('2️⃣  Testing tools listing...');
    try {
        const response = await fetch(`${url}/tools`);
        const data = await response.json();
        
        if (data.tools && Array.isArray(data.tools)) {
            console.log(`✅ Tools listing passed`);
            console.log(`   Found ${data.tools.length} tool(s):`);
            data.tools.forEach(tool => {
                console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
            });
            console.log();
            tests.push(true);
        } else {
            console.log('⚠️  No tools found\n');
            tests.push(false);
        }
    } catch (error) {
        console.log('❌ Tools listing failed');
        console.log(`   Error: ${error.message}\n`);
        tests.push(false);
    }

    // Test 3: CORS Headers
    console.log('3️⃣  Testing CORS headers...');
    try {
        const response = await fetch(`${url}/health`);
        const corsHeader = response.headers.get('access-control-allow-origin');
        
        if (corsHeader) {
            console.log('✅ CORS headers present');
            console.log(`   Access-Control-Allow-Origin: ${corsHeader}\n`);
            tests.push(true);
        } else {
            console.log('⚠️  CORS headers missing (may cause issues with web clients)\n');
            tests.push(true); // Not a critical failure
        }
    } catch (error) {
        console.log('❌ CORS check failed');
        console.log(`   Error: ${error.message}\n`);
        tests.push(false);
    }

    // Test 4: Response Time
    console.log('4️⃣  Testing response time...');
    try {
        const start = Date.now();
        await fetch(`${url}/health`);
        const duration = Date.now() - start;
        
        if (duration < 5000) {
            console.log(`✅ Response time good: ${duration}ms\n`);
            tests.push(true);
        } else {
            console.log(`⚠️  Slow response: ${duration}ms\n`);
            tests.push(true); // Not a failure, just slow
        }
    } catch (error) {
        console.log('❌ Response time test failed');
        console.log(`   Error: ${error.message}\n`);
        tests.push(false);
    }

    // Summary
    const passed = tests.filter(t => t).length;
    const total = tests.length;
    
    console.log('━'.repeat(50));
    console.log(`\n📊 Results: ${passed}/${total} tests passed\n`);
    
    if (passed === total) {
        console.log('🎉 All tests passed! Your MCP server is ready to use.\n');
        console.log('Add to your Claude Desktop config:');
        console.log(JSON.stringify({
            mcpServers: {
                "my-mcp-server": {
                    url: url
                }
            }
        }, null, 2));
    } else {
        console.log('⚠️  Some tests failed. Check the logs above for details.\n');
        if (tests[0] === false) {
            console.log('💡 Tip: The server might still be starting. Wait 1-2 minutes and try again.');
        }
    }
    
    return passed === total;
}

validateDeployment(baseUrl).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
