const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraRopsten);

const web3 = new Web3(provider);

const stakingFactoryCompiled = require('../build/StakingRewardsFactory.json');

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(stakingFactoryCompiled.abi, "0x65d17cbbA41946d269b054d2F4a43b6927670878")
		.methods.notifyRewardAmount("0xb3956ac32fc127f7b474e422c7cd043549872fea", "10000000000000000000000")
		.send({
			from: accounts[0],
			gas: '3000000',
            gasPrice: '80000000000'
		});

	console.log(
		`Transaction sent with hash: ${tx.transactionHash}`
	);

	provider.engine.stop();
})();