const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraRopsten);

const web3 = new Web3(provider);

const preStakingCompiled = require('../build/PreStakingContract.json');

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0x10C3a1d33484F2bA3F349afe42359216888016c6")
		.methods.setupStakingLimit(["100000000000000000000", "200000000000000000000", "300000000000000000000", "400000000000000000000", "500000000000000000000", "600000000000000000000", "700000000000000000000", "800000000000000000000", "900000000000000000000", "1000000000000000000000"], 1, 1)
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

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0x10C3a1d33484F2bA3F349afe42359216888016c6")
		.methods.setupRewards(5, [17, 19, 21, 23], ["0", "100000000000000000000", "200000000000000000000", "300000000000000000000"], ["100000000000000000000", "200000000000000000000", "300000000000000000000", "400000000000000000000"])
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