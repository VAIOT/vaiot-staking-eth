const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraMainnet);

const web3 = new Web3(provider);

const stakingRewardsCompiled = require('../build/StakingRewards.json');

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const stakingRewardsDeployed = await new web3.eth.Contract(stakingRewardsCompiled.abi)
		.deploy({
			data: '0x' + stakingRewardsCompiled.evm.bytecode.object,
			arguments: ["0x9F801c1F02AF03cC240546DadEf8e56Cd46EA2E9", "0x454d7156b0f62f61e7f2ad6a65d29ce681d6d354"]
		})
		.send({
			from: accounts[0],
			gas: '3000000',
            gasPrice: '120000000000'
		});

	console.log(
		`Contract deployed at address: ${stakingRewardsDeployed.options.address}`
	);

	provider.engine.stop();
})();