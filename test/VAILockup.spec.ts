import chai, { expect } from 'chai'
const _ = require('lodash')

import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import { preStakingFixture } from './fixtures'
import { mineBlock, expandTo18Decimals } from './utils'

import VAILockup from '../build/VAILockup.json'
import PreStakingContract from '../build/PreStakingContract.json'

chai.use(solidity)

const amount = BigNumber.from(256);

const preStakingConfig = {
  amounts: [
    BigNumber.from("1736460000000000000000000"),
    BigNumber.from("2131987000000000000000000"),
    BigNumber.from("2532907550000000000000000"),

    BigNumber.from("5256551640000000000000000"),
    BigNumber.from("7549579410000000000000000"),
    BigNumber.from("9850013190000000000000000"),

    BigNumber.from("12843000460000000000000000"),
    BigNumber.from("14796451620000000000000000"),
    BigNumber.from("16967343040000000000000000"),
    BigNumber.from("20500000000000000000000000")
  ],
  daysInterval: BigNumber.from(30),
  unstakingPeriod: BigNumber.from(7)
}

const rewardsConfig = {
  multiplier: BigNumber.from(2),
  rewardRates: [
    {
      anualRewardRate: BigNumber.from(17),
      lowerBound: BigNumber.from("0"),
      upperBound: expandTo18Decimals(5125000)
    },
    {
      anualRewardRate: BigNumber.from(19),
      lowerBound: expandTo18Decimals(5125000),
      upperBound: expandTo18Decimals(10250000)
    },
    {
      anualRewardRate: BigNumber.from(21),
      lowerBound: expandTo18Decimals(10250000),
      upperBound: expandTo18Decimals(15375000)
    },
    {
      anualRewardRate: BigNumber.from(23),
      lowerBound: expandTo18Decimals(15375000),
      upperBound: expandTo18Decimals(20500000)
    },
  ]
}

const anualRewardRates = rewardsConfig.rewardRates.map(rewardRate => rewardRate.anualRewardRate.toString())
const lowerBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.lowerBound.toString())
const upperBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.upperBound.toString())
const numberOfSecondsInOneDay = 86400
const numberOfParts = 4
const interval = 30

describe('VAILockup', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, account1, rewardsWallet, account3, unauthorized] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, rewardsWallet], provider)

  let vaiLockup: Contract
  let preStakingContract: Contract
  let token: Contract

  beforeEach(async () => {
    const fixture = await loadFixture(preStakingFixture)
    token = fixture.token
    preStakingContract = fixture.preStakingContract
    vaiLockup = fixture.lockupContract
  })

  describe('1. Before deployment', () => {
    it('1.1. should fail when trying to deploy with wrong argument types', async () => {
      await expect(deployContract(wallet, VAILockup, ['account.address', interval, numberOfParts])).to.be.reverted
    })

    it('1.2. should revert when the token address is not a contract', async () => {
      const revertMessage = "The address does not contain a contract"
      await expect(deployContract(wallet, VAILockup, [account1.address, interval, numberOfParts])).to.be.revertedWith(revertMessage)
    })

    it('1.3. should revert when the token address is not a contract', async () => {
      const revertMessage = "The address does not contain a contract"
      await deployContract(wallet, VAILockup, [token.address, interval, numberOfParts])
    })
  })

  describe('2. On deployment', () => {
    it('2.1. should set the token correctly', async () => {
      expect(await vaiLockup.token()).to.equal(token.address)
    })

    it('2.2. should set the interval correctly', async () => {
      expect(await vaiLockup.interval()).to.equal(interval)
    })

    it('2.3. should set the numberOfParts correctly', async () => {
      expect(await vaiLockup.numberOfParts()).to.equal(numberOfParts)
    })
  })

  describe('3. Set staking address', () => {
    it('3.1. should revert when the staking address is not a contract', async () => {
      const revertMessage = "The address does not contain a contract"
      await expect(vaiLockup.setStakingAddress(account1.address)).to.be.revertedWith(revertMessage)
    })

    it('3.2. setting staking address', async () => {
      await vaiLockup.setStakingAddress(preStakingContract.address)
    })
  })

  describe('4. Lock', () => {
    it('4.1. should revert when the amount is not divisible by the number of parts', async () => {
      const revertMessage = "The amount must be divisible by the number of parts"
      await expect(vaiLockup.lock(account1.address, 257)).to.be.revertedWith(revertMessage)
    })

    it('4.2. should set the beneficiary amount corectly', async () => {
      await token.connect(wallet).transfer(account3.address, amount)
      await token.connect(account3).approve(vaiLockup.address, amount)

      await vaiLockup.connect(account3).lock(account1.address, amount)

      let beneficiaryCurrentAmount = await vaiLockup.beneficiaryCurrentAmount(account1.address)
      await expect(beneficiaryCurrentAmount).to.be.equal(amount)
    })
  })

  describe('5. Unlock', () => {

    beforeEach(async () => {
      await token.connect(wallet).transfer(vaiLockup.address, amount)
      await token.connect(wallet).approve(preStakingContract.address, amount)

      await preStakingContract.setLockupAddress(vaiLockup.address)
      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()

      await vaiLockup.setStakingAddress(preStakingContract.address)
      await token.connect(wallet).transfer(account3.address, amount)
      await token.connect(account3).approve(vaiLockup.address, amount)
      await vaiLockup.connect(account3).lock(account1.address, amount)
    })

    it('5.1. should revert when lockup amount is staked', async () => {
      await preStakingContract.connect(account1).depositLockup(amount)

      const revertMessage = "Lockup amount is staked";
      await expect(vaiLockup.connect(account3).unlock(account1.address)).to.be.revertedWith(revertMessage)
    })

    it('5.2. beneficiary current amount should equals 64 after 120 days', async () => {
      const preStakingContract1 = await deployContract(wallet, PreStakingContract, [token.address, rewardsWallet.address])

      const vaiLockup1 = await deployContract(wallet, VAILockup, [token.address, interval, numberOfParts])
      await vaiLockup1.setStakingAddress(preStakingContract1.address)

      await preStakingContract1.setLockupAddress(vaiLockup1.address)
      await preStakingContract1.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod
      )
      await preStakingContract1.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract1.unpause()

      await token.connect(wallet).transfer(vaiLockup1.address, amount)
      await token.connect(wallet).approve(preStakingContract.address, amount)
      await token.connect(wallet).transfer(account3.address, amount)
      await token.connect(account3).approve(vaiLockup1.address, amount)

      await vaiLockup1.connect(account3).lock(account1.address, amount)

      const launchTimestamp = await vaiLockup1.startTime()
      await mineBlock(provider, launchTimestamp.add(30 * numberOfSecondsInOneDay).toNumber())

      await vaiLockup1.connect(account3).unlock(account1.address)

      await mineBlock(provider, launchTimestamp.add(60 * numberOfSecondsInOneDay).toNumber())
      await vaiLockup1.connect(account3).unlock(account1.address)

      await mineBlock(provider, launchTimestamp.add(90 * numberOfSecondsInOneDay).toNumber())
      await vaiLockup1.connect(account3).unlock(account1.address)

      await mineBlock(provider, launchTimestamp.add(120 * numberOfSecondsInOneDay).toNumber())
      let currentAmountAfterUnlock1 = await vaiLockup1.beneficiaryCurrentAmount(account1.address)
      expect(currentAmountAfterUnlock1).to.equal(64)
    })

    it('5.3. should revert when not enough days passed', async () => {
      const revertMessage = "Not enough days passed";
      await expect(vaiLockup.connect(account3).unlock(account1.address)).to.be.revertedWith(revertMessage)
    })

    it('5.4. should revert when not enough days passed', async () => {
      let currentAmount = await vaiLockup.beneficiaryCurrentAmount(account1.address)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)

      await vaiLockup.connect(account3).unlock(account1.address)

      let currentAmountAfterUnlock = await vaiLockup.beneficiaryCurrentAmount(account1.address)
      expect(currentAmountAfterUnlock).equal(currentAmount - (currentAmount / numberOfParts))
    })
  });

  describe('6. Stake and unstake', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(account3.address, amount)
      await token.connect(account3).approve(vaiLockup.address, amount)

      await vaiLockup.connect(account3).lock(account1.address, amount)
    })

    it('6.1. Stake: should revert when staking address  is not set', async () => {
      const revertMessage = "The staking address is not set";
      await expect(vaiLockup.connect(account3).stake(account1.address, amount)).to.be.revertedWith(revertMessage)
    })

    it('6.1. Stake: should revert when not call by staking address', async () => {
      await vaiLockup.setStakingAddress(preStakingContract.address)

      const revertMessage = "This address is not staking address";
      await expect(vaiLockup.connect(account3).stake(account1.address, amount)).to.be.revertedWith(revertMessage)
    })

    it('6.2. Unstake: should revert when not call by staking address', async () => {
      await vaiLockup.setStakingAddress(preStakingContract.address)
      
      const revertMessage = "This address is not staking address";
      await expect(vaiLockup.connect(account3).unstake(account1.address, amount, 0)).to.be.revertedWith(revertMessage)
    })
  })

  describe('7. Deployment', () => {
    it('7.1. PreStakingContract deployment gas', async () => {
      const receipt = await provider.getTransactionReceipt(preStakingContract.deployTransaction.hash)
      expect(receipt.gasUsed).to.eq('5025739')
    })

    it('7.2. VAILockup deployment gas', async () => {
      const receipt = await provider.getTransactionReceipt(vaiLockup.deployTransaction.hash)
      expect(receipt.gasUsed).to.eq('940205')
    })
  })
})