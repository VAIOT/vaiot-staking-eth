import chai, { expect } from 'chai'
const _ = require('lodash')

import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import { preStakingFixture } from './fixtures'
import { mineBlock } from './utils'

import PreStakingContract from '../build/StakingRewards.json'

chai.use(solidity)

const preStakingConfig = {
  maxAmount: BigNumber.from(5e+9),
  initialAmount: BigNumber.from(5e+8),
  daysInterval: BigNumber.from(3),
  unstakingPeriod: BigNumber.from(7),
  maxIntervals: BigNumber.from(10),
}

const Status = {
  Setup: 0,
  Running: 1,
  RewardsDisabled: 2,
}

const depositAmount = BigNumber.from(1e+6)
const rewardsAmount = BigNumber.from(400e+6)
const bigDepositAmount = BigNumber.from(2e+9)
const stakingConfig = {
  maxAmount: BigNumber.from(5e+9),
  initialAmount: BigNumber.from(5e+8),
  daysInterval: BigNumber.from(3),
  unstakingPeriod: BigNumber.from(7),
  maxIntervals: BigNumber.from(10),
}

const rewardsConfig = {
  multiplier: BigNumber.from(5),
  rewardRates: [
    {
      anualRewardRate: BigNumber.from(17),
      lowerBound: BigNumber.from(0),
      upperBound: BigNumber.from(1.25e+9),
    },
    {
      anualRewardRate: BigNumber.from(19),
      lowerBound: BigNumber.from(1.25e+9),
      upperBound: BigNumber.from(2.5e+9),
    },
    {
      anualRewardRate: BigNumber.from(21),
      lowerBound: BigNumber.from(2.5e+9),
      upperBound: BigNumber.from(3.75e+9),
    },
    {
      anualRewardRate: BigNumber.from(23),
      lowerBound: BigNumber.from(3.75e+9),
      upperBound: BigNumber.from(5e+9),
    },
  ]
}

const anualRewardRates = rewardsConfig.rewardRates.map(rewardRate => rewardRate.anualRewardRate.toString())
const lowerBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.lowerBound.toString())
const upperBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.upperBound.toString())
const transformRewardToString = (element: { anualRewardRate: { toString: () => any }; lowerBound: { toString: () => any }; upperBound: { toString: () => any } }) => {
  return {
    anualRewardRate: element.anualRewardRate.toString(),
    lowerBound: element.lowerBound.toString(),
    upperBound: element.upperBound.toString(),
  }
}
const numberOfSecondsInOneDay = 86400;

describe('PreStakingContract', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, rewardsWallet, account1, account2, account3, unauthorized] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, rewardsWallet], provider)

  let token: Contract
  let preStakingContract: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(preStakingFixture)
    token = fixture.token
    preStakingContract = fixture.preStakingContract
  })

  describe('3. Setup', () => {

    it('3.1. setupStakingLimit: should throw if called with wrong argument types', async () => {
      await expect(preStakingContract.setupStakingLimit(null, preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
      await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount, null, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
      await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount, preStakingConfig.initialAmount, null, preStakingConfig.unstakingPeriod)).to.be.reverted
      await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount, preStakingConfig.initialAmount, preStakingConfig.daysInterval, null)).to.be.reverted
    })

    it('3.2. setupStakingLimit: should revert if not called by the contract owner', async () => {
      const revertMessage = 'caller is not the owner'
      await expect(preStakingContract.connect(account1).setupStakingLimit(
        preStakingConfig.maxAmount,
        preStakingConfig.initialAmount,
        preStakingConfig.daysInterval,
        preStakingConfig.unstakingPeriod
      )).to.be.revertedWith(revertMessage)
    })

    it('3.3. setupStakingLimit: should revert when contract is not paused', async () => {
      await preStakingContract.unpause()
      const revertMessage = 'Pausable: not paused'
      await expect(preStakingContract.setupStakingLimit(
        preStakingConfig.maxAmount,
        preStakingConfig.initialAmount,
        preStakingConfig.daysInterval,
        preStakingConfig.unstakingPeriod
      )).to.be.revertedWith(revertMessage)
      await preStakingContract.pause()
    })

    it('3.4. setupStakingLimit: should revert if maxAmount is not a multiple of initialAmount', async () => {
      const revertMessage = "maxAmount should be a multiple of initialAmount"
      await expect(preStakingContract.setupStakingLimit(
        BigNumber.from(231e+3),
        preStakingConfig.initialAmount,
        preStakingConfig.daysInterval,
        preStakingConfig.unstakingPeriod
      )).to.be.revertedWith(revertMessage)
    })

    it('3.5. setupStakingLimit: should revert if one of the params overflow or underflow', async () => {
      const revertMessage = 'Some parameters are 0'
      await expect(preStakingContract.setupStakingLimit(
        preStakingConfig.maxAmount,
        BigNumber.from(0),
        preStakingConfig.daysInterval,
        preStakingConfig.unstakingPeriod
      )).to.be.revertedWith(revertMessage)
    })

    it('3.6. setupStakingLimit: should setup the staking limit correctly', async () => {
      await preStakingContract.setupStakingLimit(preStakingConfig.maxAmount, preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)

      let actualStakingConfig = await preStakingContract.stakingLimitConfig()
      actualStakingConfig = _.pick(actualStakingConfig, _.keys(stakingConfig))
      actualStakingConfig = _.mapValues(actualStakingConfig, { String })
      const expectedStakingConfig = _.mapValues(stakingConfig, { String })

      await expect(actualStakingConfig).to.deep.equal(expectedStakingConfig)
    })

    it('3.7. setupStakingLimit: should allow to setup staking periods until the setup is finalized (rewards are setup)', async () => {
      const newConfig = {
        maxAmount: BigNumber.from(1e+10),
        initialAmount: BigNumber.from(1e+9),
        daysInterval: BigNumber.from(3),
        unstakingPeriod: BigNumber.from(4),
        maxIntervals: BigNumber.from(10),
      }

      await preStakingContract.setupStakingLimit(newConfig.maxAmount, newConfig.initialAmount, newConfig.daysInterval, newConfig.unstakingPeriod)

      let actualStakingConfig = await preStakingContract.stakingLimitConfig()
      actualStakingConfig = _.pick(actualStakingConfig, _.keys(newConfig))
      actualStakingConfig = _.mapValues(actualStakingConfig, { String })
      const expectedStakingConfig = _.mapValues(newConfig, { String })

      await expect(expectedStakingConfig).to.deep.equal(actualStakingConfig)
    })

    it('3.8. setupRewards: should revert if not called by the contract owner', async () => {
      const revertMessage = 'Ownable: caller is not the owner'
      await expect(preStakingContract.connect(account1).setupRewards(rewardsConfig.multiplier, anualRewardRates, lowerBounds, upperBounds)).to.be.revertedWith(revertMessage)
    })

    it('3.9. setupRewards: should revert when contract is not paused', async () => {
      await preStakingContract.unpause()
      const revertMessage = 'VM Exception while processing transaction: revert Pausable: not paused'
      await expect(preStakingContract.setupRewards(rewardsConfig.multiplier, anualRewardRates, lowerBounds, upperBounds)).to.be.revertedWith(revertMessage)
      await preStakingContract.pause()
    })

    it('3.10. setupRewards: should throw if called with wrong argument types', async () => {
      await expect(preStakingContract.setupRewards('not a number', anualRewardRates, lowerBounds, upperBounds)).to.be.reverted
    })

    it('3.11. setupRewards: should revert if validations fail', async () => {
      const message1 = 'All parameters must have at least one element'
      const message2 = 'All parameters must have the same number of elements'
      const message3 = 'First lower bound should be 0'
      const message4 = 'Multiplier should be smaller than 100 and divide it equally'
      let wrongLowerBounds = _.clone(lowerBounds)
      wrongLowerBounds[0] = '123'

      await expect(
        preStakingContract.setupRewards(
          rewardsConfig.multiplier, [], lowerBounds, upperBounds
        )).to.be.revertedWith(message1)

      await expect(
        preStakingContract.setupRewards(
          rewardsConfig.multiplier, anualRewardRates, _.slice(lowerBounds, 1), upperBounds
        )).to.be.revertedWith(message2)

      await expect(
        preStakingContract.setupRewards(
          rewardsConfig.multiplier, anualRewardRates, wrongLowerBounds, upperBounds
        )).to.be.revertedWith(message3)

      await expect(
        preStakingContract.setupRewards(
          BigNumber.from(123), anualRewardRates, lowerBounds, upperBounds
        )).to.be.revertedWith(message4)
    })

    it('3.12. setupRewards: should setup the rewards with correct param values and number', async () => {
      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      )

      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )

      const actualMultiplier = await preStakingContract.rewardConfig()
      const actualRewardsLength = await preStakingContract.baseRewardsLength()

      let actualRewardsConfig = []
      let baseReward

      for (let i = 0; i < actualRewardsLength; i++) {
        baseReward = await preStakingContract.baseReward(i.toString())
        actualRewardsConfig.push({
          anualRewardRate: baseReward['0'],
          lowerBound: baseReward['1'],
          upperBound: baseReward['2'],
        })
      }
      actualRewardsConfig = actualRewardsConfig.map(transformRewardToString)
      let expectedRewardsConfig = rewardsConfig.rewardRates.map(transformRewardToString)

      const zeroRewardLowerBound = BigNumber.from(5e+9)
      // Adding the 0 annual reward rate
      expectedRewardsConfig.push(
        {
          anualRewardRate: '0',
          lowerBound: zeroRewardLowerBound.toString(),
          upperBound: zeroRewardLowerBound.add(BigNumber.from(10)).toString(),
        }
      )

      await expect(actualRewardsConfig).to.deep.equal(expectedRewardsConfig)
      await expect(actualMultiplier.toString()).to.equal(rewardsConfig.multiplier.toString())
      await expect(actualRewardsLength.toNumber()).to.equal(expectedRewardsConfig.length)





      expect((await preStakingContract.baseRewardHistoryLength()).toString()).to.equal('1')
      expect(await preStakingContract.currentStatus()).to.equal(1)

      const revertMessage = 'Setup is already done'
      await expect(preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )).to.be.revertedWith(revertMessage)

    })

    it('3.13. setupRewards: should initialize the base rewards history with the first BaseReward which is also the smallest', async () => {
      expect((await preStakingContract.baseRewardHistoryLength()).toString()).to.equal('1')
    })

    it('3.14. setupRewards: should set the status to Running when the staking is configured', async () => {
      //Status.Running = 1
      expect(await preStakingContract.currentStatus()).to.equal(1)
    })

    it('3.15. setupRewards: should revert when contract is already setup', async () => {
      const revertMessage = 'Setup is already done'
      await expect(
        preStakingContract.setupRewards(
          rewardsConfig.multiplier,
          anualRewardRates,
          lowerBounds,
          upperBounds
        )).to.be.revertedWith(revertMessage)
    })
  })

  describe('4. Deposit and withdraw', () => {

    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
      await token.connect(wallet).transfer(account1.address, depositAmount)
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, depositAmount)

      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()
    })

    it('4.1. deposit: should revert when contract is not setup', async () => {
      const revertMessage = 'Setup is not done'
      await expect(preStakingContract.deposit(depositAmount)).to.be.revertedWith(revertMessage)
    })

    it('4.3. deposit: should revert when contract is paused', async () => {
      await preStakingContract.pause()
      const revertMessage = 'Pausable: paused'
      await expect(preStakingContract.deposit(depositAmount)).to.be.revertedWith(revertMessage)
      await preStakingContract.unpause()
    })

    it('4.4. deposit: should revert if deposit is called with an amount of 0', async () => {
      const message = "The stake deposit has to be larger than 0"
      await expect(preStakingContract.deposit('0')).to.be.revertedWith(message)
    })

    it('4.5. deposit: should revert if the account already has a stake deposit', async () => {
      const message = "You already have a stake"
      await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account1.address, depositAmount)
      await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.be.revertedWith(message)
    })

    it('4.6. deposit: should revert if the transfer fails because of insufficient funds', async () => {
      const exceedsBalanceMessage = "revert ERC20: transfer amount exceeds balance"
      await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.be.revertedWith(exceedsBalanceMessage)
      await token.connect(wallet).transfer(account2.address, depositAmount)
      const exceedsAllowanceMessage = "revert ERC20: transfer amount exceeds allowance"
      await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.be.revertedWith(exceedsAllowanceMessage)
    })

    it('4.7. deposit: should create a new deposit for the depositing account and emit StakeDeposited(msg.sender, amount)', async () => {
      const initialBalance = await token.balanceOf(preStakingContract.address)
      await token.connect(account2).approve(preStakingContract.address, depositAmount)
      await token.connect(wallet).transfer(account2.address, depositAmount)
      await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account2.address, depositAmount)
      const currentBalance = await token.balanceOf(preStakingContract.address)
      await expect(initialBalance.add(depositAmount)).to.be.equal(currentBalance)
    })

    it('4.8. deposit: should have current total stake less than current maximum staking limit', async () => {
      const totalStake = await preStakingContract.currentTotalStake()
      const currentMaxLimit = await preStakingContract.currentStakingLimit()

      await expect(totalStake).to.be.below(currentMaxLimit)
      await expect(currentMaxLimit).to.be.equal(stakingConfig.initialAmount)
    })

    it('4.9. deposit: should revert if trying to deposit more than the first wave limit (5 * 10^8)', async () => {
      const revertMessage = "Your deposit would exceed the current staking limit"
      await token.connect(wallet).transfer(account3.address, stakingConfig.initialAmount.add(BigNumber.from(1)))

      await expect(preStakingContract.connect(account3).deposit(stakingConfig.initialAmount.add(BigNumber.from(1)))).to.be.revertedWith(revertMessage)
    })

    it('4.10. initiateWithdrawal: should revert when contract is paused', async () => {
      await preStakingContract.pause()
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith("Pausable: paused")
      await preStakingContract.unpause()
    })

    it('4.12. initiateWithdrawal: should revert if minimum staking period did not pass', async () => {
      const revertMessage = "Not enough days passed"
      // 0 Days passed
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)

      // 26 Days passed
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 26 * numberOfSecondsInOneDay)
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)

      // 27 Days passed
      const timestamp1 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp1 + numberOfSecondsInOneDay)
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.13. initiateWithdrawal: should revert if the account has no stake deposit', async () => {
      // 30 Days passed
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      const revertMessage = "There is no stake deposit for this account"
      await expect(preStakingContract.connect(unauthorized).initiateWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.14. initiateWithdrawal: should emit the WithdrawInitiated(msg.sender, stakeDeposit.amount) event', async () => {
      // 30 Days passed
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.emit(preStakingConfig, 'WithdrawInitiated').withArgs(account1.address, depositAmount)
    })

    it('4.15. initiateWithdrawal: should revert if account has already initiated the withdrawal', async () => {
      // 30 Days passed
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      const revertMessage = "You already initiated the withdrawal"
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.16. executeWithdrawal: should revert when contract is paused', async () => {
      const revertMessage = "Pausable: paused"
      await preStakingContract.pause()
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
      await preStakingContract.unpause()
    })

    it('4.17. executeWithdrawal: should revert if there is no deposit on the account', async () => {
      const revertMessage = "There is no stake deposit for this account"
      await expect(preStakingContract.executeWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.18. executeWithdrawal: should revert if the withdraw was not initialized', async () => {
      const revertMessage = "Withdraw is not initialized"
      await expect(preStakingContract.connect(account2).executeWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.19. executeWithdrawal: should revert if unstaking period did not pass', async () => {
      const revertMessage = 'The unstaking period did not pass'
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.20. executeWithdrawal: should revert if transfer fails on reward', async () => {
      const revertMessage = "ERC20: transfer amount exceeds allowance"

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 7 * numberOfSecondsInOneDay)

      await token.connect(rewardsWallet).decreaseAllowance(
        preStakingContract.address,
        rewardsAmount.sub(BigNumber.from(123))
      )

      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
    })

    it('4.21. currentReward(): should return the stake deposit and current reward for a specified account', async () => {
      const currentReward = await preStakingContract.currentReward(account1.address)

      await expect(currentReward[0]).to.be.equal(depositAmount)
      await expect(currentReward[1]).to.be.above(BigNumber.from(0))
    })

    it('4.22. getStakeDeposit(): should return the current the stake deposit for the msg.sender', async () => {
      const stakeDeposit = await preStakingContract.connect(account1).getStakeDeposit()

      await expect(stakeDeposit[0]).to.be.equal(depositAmount)
    })

    it('4.23. executeWithdrawal: should transfer the initial staking deposit and the correct reward and emit WithdrawExecuted', async () => {
      await token.connect(rewardsWallet).increaseAllowance(
        preStakingContract.address,
        rewardsAmount.sub(BigNumber.from(123))
      )
      const initialTotalStake = await preStakingContract.currentTotalStake()
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.emit(preStakingContract, 'WithdrawExecuted').withArgs(account1.address, depositAmount)
      const currentTotalStake = await preStakingContract.currentTotalStake()

      await expect(currentTotalStake).to.be.equal(initialTotalStake.sub(depositAmount))
    })

  })

  describe('5. Disable rewards', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
      await token.connect(wallet).transfer(account1.address, depositAmount)
      await token.connect(wallet).transfer(account2.address, depositAmount)
      await token.connect(wallet).transfer(account3.address, depositAmount)

      //allow staking contract
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, depositAmount)
      await token.connect(account2).approve(preStakingContract.address, depositAmount)
      await token.connect(account3).approve(preStakingContract.address, depositAmount)

      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds

      )
      await preStakingContract.unpause()
    })

    it('5.1. should allow only the owner to disable rewards', async () => {
      const msg = "Ownable: caller is not the owner"
      await expect(preStakingContract.connect(unauthorized).toggleRewards(true)).to.be.revertedWith(msg)
    })

    it("5.2.should reduce the reward to half if rewards are disabled for 15 out of 30 days", async () => {
      //Account 1
      await preStakingContract.connect(account1).deposit(depositAmount)
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 15 * numberOfSecondsInOneDay)

      //   await preStakingContract.toggleRewards(false)

      const timestamp1 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp1 + 15 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).initiateWithdrawal()

      const timestamp2 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp2 + 8 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).executeWithdrawal()

      let reward1 = BigNumber.from(0)
      let reward2 = BigNumber.from(0)
      let ifReward = false
      preStakingContract.on("WithdrawExecuted", async (account, amount, reward) => {
        if (account == account1.address) {
          reward1 = reward
          console.log("reward 1", reward1)
        } else if (account == account2.address) {
          reward2 = reward
          console.log("reward 2", reward2)
          ifReward = true
          expect(reward1).to.be.equal(reward2.div(BigNumber.from(2)))
        }

        if (ifReward) {
          console.log("aa1")
          expect(reward1).to.be.equal(reward2.div(BigNumber.from(2)))
        }
      })

      //Account 2
      //    await preStakingContract.toggleRewards(true)
      await preStakingContract.connect(account2).deposit(depositAmount)
      const timestamp3 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp3 + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).initiateWithdrawal()
      const timestamp4 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp4 + 8 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).executeWithdrawal()

      console.log(ifReward)
      if (ifReward) {
        console.log("aa")
        expect(reward1).to.be.equal(reward2.div(BigNumber.from(2)))
      }
    })
  })

  describe('6. Staking limit waves', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
      await token.connect(wallet).transfer(account1.address, bigDepositAmount)
      await token.connect(wallet).transfer(account2.address, bigDepositAmount)
      await token.connect(wallet).transfer(account3.address, bigDepositAmount)

      //allow staking contract
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, bigDepositAmount)
      await token.connect(account2).approve(preStakingContract.address, bigDepositAmount)
      await token.connect(account3).approve(preStakingContract.address, bigDepositAmount)

      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()
    })

    it('6.1. should not advance the wave earlier', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 2 * numberOfSecondsInOneDay)

      await expect(preStakingContract.connect(account1).deposit(bigDepositAmount),
        "[Deposit] Your deposit would exce.ed the current staking limit"
      )

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      await expect(currentStakingLimit).to.be.equal(BigNumber.from(500e+6))
    })

    it('6.2. should advance the staking limit to the second wave (1 Billion)', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 3 * numberOfSecondsInOneDay)

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      await expect(currentStakingLimit).to.be.equal(BigNumber.from(1e+9))
    })

    it('6.3. should advance the stakingLimit to the second wave (1.5 Billion) ', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 6 * numberOfSecondsInOneDay)

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      await expect(currentStakingLimit).to.be.equal(BigNumber.from(1.5e+9))
    })

    it('6.4. should advance the staking limit to the maximum amount and not more', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 33 * numberOfSecondsInOneDay)

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      await expect(currentStakingLimit).to.be.equal(BigNumber.from(5e+9))
    })
  })

  describe('7. Calling currentReward before initiating withdrawal', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
      await token.connect(wallet).transfer(account1.address, depositAmount)

      //allow staking contract
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, depositAmount)

      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()

      await preStakingContract.connect(account1).deposit(depositAmount)
    })

    it('7.1. should return 0 in the first day', async () => {
      const stake = await preStakingContract.currentReward(account1.address)

      await expect(stake.initialDeposit).to.be.equal(depositAmount)
      await expect(stake.reward).to.be.equal(BigNumber.from(0))
    })

    it('7.2. should return the current reward without throwing an error', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 10 * numberOfSecondsInOneDay)

      const stake = await preStakingContract.currentReward(account1.address)

      // Result got from the excel simulation '4890.41095890411'
      const expectedReward = '4890'

      const actualReward = stake.reward.div(BigNumber.from(1))

      await expect(actualReward.toString()).to.equal(expectedReward)
    })
  })

  describe('8. After executing withdrawal', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
      await token.connect(wallet).transfer(account1.address, depositAmount)

      //allow staking contract
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, depositAmount)

      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()

      await preStakingContract.connect(account1).deposit(depositAmount)
    })

    it('8.1. should revert when making a second deposit even after withdrawing', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).initiateWithdrawal()

      const timestamp2 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp2 + 7 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).executeWithdrawal()

      await token.connect(account1).approve(preStakingContract.address, depositAmount)
      await expect(
        preStakingContract.connect(account1).deposit(depositAmount),
        "[Deposit] You already have a stake"
      )
    })

    it('8.2. should revert when calling again initiateWithdrawal', async () => {
      const message = "[Initiate Withdrawal] There is no stake deposit for this account"
      await expect(preStakingContract.connect(account1).initiateWithdrawal(), message)
    })

    it('8.3. should revert when calling again executeWithdrawal', async () => {
      const message = "[Withdraw] There is no stake deposit for this account"
      await expect(preStakingContract.connect(account1).executeWithdrawal(), message)
    })
  })
})