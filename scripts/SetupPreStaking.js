const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraRopsten);

const web3 = new Web3(provider);

const preStakingCompiled = require('../build/PreStakingContract.json');

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0xd1D61eb27568433314283A93aCF868FDFa3ceC95")
		.methods.setupStakingLimit(
			[expandDecimals("5300000"),
			expandDecimals("5400000"),
			expandDecimals("5500000"),
			expandDecimals("6800000"),
			expandDecimals("6900000"),
			expandDecimals("7000000"),
			expandDecimals("7100000"),
			expandDecimals("7700000"),
			expandDecimals("8500000"),
			expandDecimals("10000000")], 30)
		.send({
			from: accounts[0],
			gas: '3000000',
            gasPrice: '80000000000',
			chainId: 3
		});

	console.log(
		`Transaction sent with hash: ${tx.transactionHash}`
	);

	provider.engine.stop();
})();

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0xd1D61eb27568433314283A93aCF868FDFa3ceC95")
		.methods.setupRewards(2, [35, 37, 39, 41],
			["0",
			expandDecimals("2500000"),
			expandDecimals("5000000"),
			expandDecimals("7500000")],
			[expandDecimals("2500000"),
			expandDecimals("5000000"),
			expandDecimals("7500000"),
			expandDecimals("10000000")])
		.send({
			from: accounts[0],
			gas: '3000000',
            gasPrice: '80000000000',
			chainId: 3
		});

	console.log(
		`Transaction sent with hash: ${tx.transactionHash}`
	);

	provider.engine.stop();
})();

function expandDecimals(value) {
	return value + "000000000000000000";
}