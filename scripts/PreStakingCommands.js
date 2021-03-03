const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const provider = new HDWalletProvider(process.env.mnemonic, process.env.infuraRopsten);

const web3 = new Web3(provider);

const preStakingCompiled = require('../build/PreStakingContract.json');
const erc20Compiled = require('@openzeppelin/contracts/build/contracts/ERC20.json');

// (async () => {
// 	const accounts = await web3.eth.getAccounts();

// 	console.log(`Attempting to deploy from account: ${accounts[0]}`);

// 	const tx = await new web3.eth.Contract(erc20Compiled.abi, "0x9F801c1F02AF03cC240546DadEf8e56Cd46EA2E9")
// 		.methods.approve("0x590d4780eD198e17F1592F17Bb214322da7694aE", "10000000000000000000000000")
// 		.send({
// 			from: accounts[0],
// 			gas: '3000000',
//             gasPrice: '80000000000'
// 		});

// 	console.log(
// 		`Transaction sent with hash: ${tx.transactionHash}`
// 	);

// 	provider.engine.stop();
// })();

(async () => {
	const accounts = await web3.eth.getAccounts();

	console.log(`Attempting to deploy from account: ${accounts[0]}`);

	const tx = await new web3.eth.Contract(preStakingCompiled.abi, "0x590d4780eD198e17F1592F17Bb214322da7694aE")
		.methods.unpause()
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