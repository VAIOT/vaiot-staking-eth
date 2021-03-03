const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraRopsten);

const web3 = new Web3(provider);

const preStakingCompiled = require('../build/PreStakingContract.json');

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0x590d4780eD198e17F1592F17Bb214322da7694aE")
		.methods.setupStakingLimit(
			[expandDecimals("1736000"),
			expandDecimals("2131000"),
			expandDecimals("2532000"),
			expandDecimals("5256000"),
			expandDecimals("7549000"),
			expandDecimals("9850000"),
			expandDecimals("12843000"),
			expandDecimals("14796000"),
			expandDecimals("16967000"),
			expandDecimals("20500000")], 30, 7)
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

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0x590d4780eD198e17F1592F17Bb214322da7694aE")
		.methods.setupRewards(2, [17, 19, 21, 23],
			["0",
			expandDecimals("5125000"),
			expandDecimals("10250000"),
			expandDecimals("15375000")],
			[expandDecimals("5125000"),
			expandDecimals("10250000"),
			expandDecimals("15375000"),
			expandDecimals("20500000")])
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

function expandDecimals(value) {
	return value + "000000000000000000";
}