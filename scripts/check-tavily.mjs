// Run only with the legitimate server key already in the process environment.
import {searchTavily} from '../lib/integrations/tavily.ts';
import {IntegrationError} from '../lib/integrations/server.ts';
try {
 const result=await searchTavily('Tavily official basic web search documentation');
 const count=result.sources?.length??0;
 console.log(JSON.stringify({provider:'tavily',searchDepth:'basic',success:count>0,sourceCount:count}));
 if(!count)process.exitCode=1;
} catch(error) {
 console.error(JSON.stringify({provider:'tavily',success:false,status:error instanceof IntegrationError?error.status:502,message:error instanceof IntegrationError?error.message:'Search test failed.'}));
 process.exitCode=1;
}
