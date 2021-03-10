const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraRopsten);

const web3 = new Web3(provider);

const lockupCompiled = require('../build/VAILockup.json');

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const preStakingDeployed = await new web3.eth.Contract(lockupCompiled.abi)
		.deploy({
			data: '0x' + lockupCompiled.evm.bytecode.object,
			arguments: ["0x9F801c1F02AF03cC240546DadEf8e56Cd46EA2E9", 2592000, 4]
		})
		.send({
			from: accounts[0],
			gas: '5000000',
            gasPrice: '80000000000'
		});

	console.log(
		`Contract deployed at address: ${preStakingDeployed.options.address}`
	);

	provider.engine.stop();
})();