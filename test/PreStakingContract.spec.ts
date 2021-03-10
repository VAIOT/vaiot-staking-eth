import chai, { expect } from 'chai'
const _ = require('lodash')

import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import { preStakingFixture } from './fixtures'
import { mineBlock, expandTo18Decimals } from './utils'

import PreStakingContract from '../build/PreStakingContract.json'

chai.use(solidity)

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
}

const Status = {
  Setup: 0,
  Running: 1,
  RewardsDisabled: 2,
}

const depositAmount = BigNumber.from("1000000")
const rewardsAmount = expandTo18Decimals(4676921)
const bigDepositAmount = BigNumber.from("2000000000000000000000000")

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
const transformRewardToString = (element: { anualRewardRate: { toString: () => any }; lowerBound: { toString: () => any }; upperBound: { toString: () => any } }) => {
  return {
    anualRewardRate: element.anualRewardRate.toString(),
    lowerBound: element.lowerBound.toString(),
    upperBound: element.upperBound.toString(),
  }
}
const numberOfSecondsInOneDay = 86400
const amount = BigNumber.from(256);

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

  let vaiLockup: Contract
  let token: Contract
  let preStakingContract: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(preStakingFixture)
    token = fixture.token
    preStakingContract = fixture.preStakingContract
    vaiLockup = fixture.lockupContract
  })

  describe('1. Before deployment', () => {
    it('1.1. should fail when trying to deploy with wrong argument types', async () => {
      await expect(deployContract(wallet, PreStakingContract, [token.address, 'rewardsWallet.address'])).to.be.reverted
      await expect(deployContract(wallet, PreStakingContract, [token.address, rewardsAmount])).to.be.reverted
      await expect(deployContract(wallet, PreStakingContract, ['token.address', rewardsWallet.address])).to.be.reverted
      await expect(deployContract(wallet, PreStakingContract, [0, rewardsWallet.address])).to.be.reverted
    })

    it('1.2. should revert when the token address is not a contract', async () => {
      const revertMessage = "The address does not contain a contract"
      await expect(deployContract(wallet, PreStakingContract, [account1.address, rewardsWallet.address])).to.be.revertedWith(revertMessage)
    })

    it('1.3. should revert when _rewardsAddress is the zero address', async () => {
      const revertMessage = " _rewardsAddress is the zero address"
      await expect(deployContract(wallet, PreStakingContract, [token.address, '0x0000000000000000000000000000000000000000'])).to.be.revertedWith(revertMessage)
    })
  })

  describe('2. On deployment', () => {
    it('2.1. should set the right owner', async () => {
      expect(await preStakingContract.owner()).to.be.equal(wallet.address)
    })

    it('2.2. should set the token correctly', async () => {
      expect(await preStakingContract.token()).to.equal(token.address)
    })

    it('2.3. should set the right rewardsAddress', async () => {
      expect(await preStakingContract.rewardsAddress()).to.equal(rewardsWallet.address)
    })

    it('2.4. should set the currentStatus to Setup', async () => {
      expect((await preStakingContract.currentContractStatus())).to.equal(Status.Setup)
    })
  })

  describe('3. Setup', () => {
    it('3.1. setupStakingLimit: should throw if called with wrong argument types', async () => {
      await expect(preStakingContract.setupStakingLimit([null], preStakingConfig.daysInterval)).to.be.reverted
      await expect(preStakingContract.setupStakingLimit(preStakingConfig.amounts, null)).to.be.reverted
    })

    it('3.2. setupStakingLimit: should revert if not called by the contract owner', async () => {
      const revertMessage = 'caller is not the owner'
      await expect(preStakingContract.connect(account1).setupStakingLimit(
        preStakingConfig.amounts,
        preStakingConfig.daysInterval
      )).to.be.revertedWith(revertMessage)
    })

    it('3.3. setupStakingLimit: should revert when contract is not paused', async () => {
      await preStakingContract.unpause()
      const revertMessage = 'Pausable: not paused'
      await expect(preStakingContract.setupStakingLimit(
        preStakingConfig.amounts,
        preStakingConfig.daysInterval
      )).to.be.revertedWith(revertMessage)
      await preStakingContract.pause()
    })

    it('3.4. setupStakingLimit: should revert if rewards are not in ascending order', async () => {
      const revertMessage = 'rewards should be in ascending order'

      await expect(preStakingContract.setupStakingLimit(
        [BigNumber.from("100000000000000000"), BigNumber.from("1000000")],
        preStakingConfig.daysInterval
      )).to.be.revertedWith(revertMessage)
    })

    it('3.5. setupStakingLimit: should revert if one of the params overflow or underflow', async () => {
      const revertMessage = 'some of amounts are 0'
      await expect(preStakingContract.setupStakingLimit(
        [BigNumber.from(0)],
        preStakingConfig.daysInterval
      )).to.be.revertedWith(revertMessage)
    })

    it('3.6. setupStakingLimit: should setup the staking limit correctly', async () => {
      await preStakingContract.setupStakingLimit(preStakingConfig.amounts, preStakingConfig.daysInterval)

      let actualStakingConfig = await preStakingContract.stakingLimitConfig()
      let limitAmounts = await preStakingContract.getLimitAmounts()

      expect(actualStakingConfig).to.equal(preStakingConfig.daysInterval)
      expect(limitAmounts).to.deep.equal(preStakingConfig.amounts)
    })

    it('3.7. setupRewards: should revert if not called by the contract owner', async () => {
      const revertMessage = 'Ownable: caller is not the owner'
      await expect(preStakingContract.connect(account1).setupRewards(rewardsConfig.multiplier, anualRewardRates, lowerBounds, upperBounds)).to.be.revertedWith(revertMessage)
    })

    it('3.8. setupRewards: should revert when contract is not paused', async () => {
      await preStakingContract.unpause()
      const revertMessage = 'VM Exception while processing transaction: revert Pausable: not paused'
      await expect(preStakingContract.setupRewards(rewardsConfig.multiplier, anualRewardRates, lowerBounds, upperBounds)).to.be.revertedWith(revertMessage)
      await preStakingContract.pause()
    })

    it('3.9. setupRewards: should revert if validations fail', async () => {
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

    it('3.10. setupRewards: should setup the rewards with correct param values and number', async () => {
      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
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

      const zeroRewardLowerBound = BigNumber.from("20500000000000000000000000")
      // Adding the 0 annual reward rate
      expectedRewardsConfig.push(
        {
          anualRewardRate: '0',
          lowerBound: zeroRewardLowerBound.toString(),
          upperBound: zeroRewardLowerBound.add(BigNumber.from(10)).toString(),
        }
      )

      expect(actualRewardsConfig).to.deep.equal(expectedRewardsConfig)
      expect(actualMultiplier.toString()).to.equal(rewardsConfig.multiplier.toString())
      expect(actualRewardsLength.toNumber()).to.equal(expectedRewardsConfig.length)
    })

    it('3.11. setupRewards: should initialize the base rewards history with the first BaseReward which is also the smallest', async () => {
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )

      expect((await preStakingContract.baseRewardHistoryLength()).toString()).to.equal('1')
    })

    it('3.12. setupRewards: should set the status to Running when the staking is configured', async () => {
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )

      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
      )

      //Status.Running = 1
      expect(await preStakingContract.currentContractStatus()).to.equal(1)
    })

    it('3.13. setupRewards: should revert when contract is already setup', async () => {
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )

      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
      )

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

    describe('4a. Deposit and withdraw', () => {
      it('4.1. deposit: should revert when contract is not setup', async () => {
        const revertMessage = 'Setup is not done'
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.be.revertedWith(revertMessage)
      })
    })

    describe('4b. Deposit and withdraw', () => {
      beforeEach(async () => {
        await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
        await token.connect(wallet).transfer(account1.address, depositAmount)
        await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
        await token.connect(account1).approve(preStakingContract.address, depositAmount)

        await preStakingContract.setupStakingLimit(
          preStakingConfig.amounts, preStakingConfig.daysInterval
        )
        await preStakingContract.setupRewards(
          rewardsConfig.multiplier,
          anualRewardRates,
          lowerBounds,
          upperBounds
        )
        await preStakingContract.unpause()
      })

      it('4.2. deposit: should revert when contract is paused', async () => {
        await preStakingContract.pause()
        const revertMessage = 'Pausable: paused'
        await expect(preStakingContract.deposit(depositAmount)).to.be.revertedWith(revertMessage)
        await preStakingContract.unpause()
      })

      it('4.3. deposit: should revert if deposit is called with an amount of 0', async () => {
        const message = "The stake deposit has to be larger than 0"
        await expect(preStakingContract.deposit('0')).to.be.revertedWith(message)
      })

      it('4.4. deposit: should revert if the account already has a stake deposit', async () => {
        const message = "You already have a stake"
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account1.address, depositAmount)
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.be.revertedWith(message)
      })

      it('4.5. deposit: should revert if the transfer fails because of insufficient funds', async () => {
        const exceedsBalanceMessage = "revert ERC20: transfer amount exceeds balance"
        await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.be.revertedWith(exceedsBalanceMessage)
        await token.connect(wallet).transfer(account2.address, depositAmount)
        const exceedsAllowanceMessage = "revert ERC20: transfer amount exceeds allowance"
        await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.be.revertedWith(exceedsAllowanceMessage)
      })

      it('4.6. deposit: should create a new deposit for the depositing account and emit StakeDeposited(msg.sender, amount)', async () => {
        const initialBalance = await token.balanceOf(preStakingContract.address)
        await token.connect(account2).approve(preStakingContract.address, depositAmount)
        await token.connect(wallet).transfer(account2.address, depositAmount)
        await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account2.address, depositAmount)
        const currentBalance = await token.balanceOf(preStakingContract.address)
        expect(initialBalance.add(depositAmount)).to.be.equal(currentBalance)
      })

      it('4.7. deposit: should have current total stake less than current maximum staking limit', async () => {
        const totalStake = await preStakingContract.currentTotalStake()
        const currentMaxLimit = await preStakingContract.currentStakingLimit()

        expect(totalStake).to.be.below(currentMaxLimit)
        expect(currentMaxLimit).to.be.equal(preStakingConfig.amounts[0])
      })

      it('4.8. deposit: should revert if trying to deposit more than the first wave limit (5 * 10^8)', async () => {
        const revertMessage = "Your deposit would exceed the current staking limit"
        await token.connect(wallet).transfer(account3.address, preStakingConfig.amounts[0].add(BigNumber.from(1)))

        await expect(preStakingContract.connect(account3).deposit(preStakingConfig.amounts[0].add(BigNumber.from(1)))).to.be.revertedWith(revertMessage)
      })
      it('4.9. executeWithdrawal: should revert when contract is paused', async () => {
        const revertMessage = "Pausable: paused"
        await preStakingContract.pause()
        await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
        await preStakingContract.unpause()
      })

      it('4.10. executeWithdrawal: should revert if there is no deposit on the account', async () => {
        // 63 Days passed
        const timestamp = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp + 63 * numberOfSecondsInOneDay)

        const revertMessage = "There is no stake deposit for this account"
        await expect(preStakingContract.executeWithdrawal()).to.be.revertedWith(revertMessage)
      })

      it('4.12. executeWithdrawal: should revert if transfer fails on reward', async () => {
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account1.address, depositAmount)
        const timestamp = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp + 63 * numberOfSecondsInOneDay)

        const revertMessage = "ERC20: transfer amount exceeds allowance"

        const timestamp1 = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp1 + 7 * numberOfSecondsInOneDay)

        await token.connect(rewardsWallet).decreaseAllowance(
          preStakingContract.address,
          rewardsAmount.sub(BigNumber.from(123))
        )
        await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
      })

      it('4.13. earned(): should return current reward for a specified account', async () => {
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account1.address, depositAmount)

        const timestamp = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp + 1 * numberOfSecondsInOneDay)

        const currentReward = await preStakingContract.earned(account1.address)
        expect(currentReward).to.be.above(BigNumber.from(0))
      })

      it('4.14. getStakeDeposit(): should return the current the stake deposit for the msg.sender', async () => {
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account1.address, depositAmount)

        const stakeDeposit = await preStakingContract.connect(account1).getStakeDeposit()
        expect(stakeDeposit[0]).to.be.equal(depositAmount)
      })

      it('4.15. executeWithdrawal: should transfer the initial staking deposit and the correct reward and emit WithdrawExecuted', async () => {
        await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.emit(preStakingContract, 'StakeDeposited').withArgs(account1.address, depositAmount)
        const timestamp = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp + 63 * numberOfSecondsInOneDay)

        await token.connect(rewardsWallet).increaseAllowance(
          preStakingContract.address,
          rewardsAmount.sub(BigNumber.from(123))
        )
        const initialTotalStake = await preStakingContract.currentTotalStake()
        await expect(preStakingContract.connect(account1).executeWithdrawal()).to.emit(preStakingContract, 'WithdrawExecuted')
        const currentTotalStake = await preStakingContract.currentTotalStake()

        expect(currentTotalStake).to.be.equal(initialTotalStake.sub(depositAmount))
      })
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
        preStakingConfig.amounts, preStakingConfig.daysInterval
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
      await mineBlock(provider, timestamp + 32 * numberOfSecondsInOneDay)

      await preStakingContract.toggleRewards(false)

      const timestamp1 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp1 + 32 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).executeWithdrawal()

      let reward1 = BigNumber.from(0)
      let reward2 = BigNumber.from(0)

      let transferEvent = new Promise((resolve, reject) => {
        preStakingContract.on('WithdrawExecuted', (account, amount, reward, event) => {
          event.removeListener()

          if (account == account1.address) {
            reward1 = reward
          }
          resolve({
          })
        })
      })
      await transferEvent

      //Account 2
      await preStakingContract.toggleRewards(true)
      await preStakingContract.connect(account2).deposit(depositAmount)
      const timestamp3 = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp3 + 64 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).executeWithdrawal()

      let transferEvent2 = new Promise((resolve, reject) => {
        preStakingContract.on('WithdrawExecuted', (account, amount, reward, event) => {
          event.removeListener()

          if (account == account2.address) {
            reward2 = reward
          }
          resolve({
          })
        })
      })
      await transferEvent2

      expect(reward1).to.be.equal(reward2.div(BigNumber.from(2)))
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
        preStakingConfig.amounts, preStakingConfig.daysInterval
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

      await expect(preStakingContract.connect(account1).deposit(bigDepositAmount)).to.be.revertedWith("Your deposit would exceed the current staking limit")

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      expect(currentStakingLimit).to.be.equal(BigNumber.from("1736460000000000000000000"))
    })

    it('6.2. should advance the staking limit to the second wave', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      expect(currentStakingLimit).to.be.equal(BigNumber.from("2131987000000000000000000"))
    })

    it('6.3. should advance the stakingLimit to the third wave', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      expect(currentStakingLimit).to.be.equal(BigNumber.from("2532907550000000000000000"))
    })

    it('6.4. should advance the staking limit to the maximum amount and not more', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 270 * numberOfSecondsInOneDay)

      const currentStakingLimit = await preStakingContract.currentStakingLimit()
      expect(currentStakingLimit).to.be.equal(BigNumber.from("20500000000000000000000000"))
    })
  })

  describe('7. Calling currentReward before initiating withdrawal', () => {

    it('7.1. should return the current reward without throwing an error', async () => {
      const preStakingContract1 = await deployContract(wallet, PreStakingContract, [token.address, rewardsWallet.address])
      await preStakingContract1.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
      )
      await preStakingContract1.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract1.unpause()
      await token.connect(account1).approve(preStakingContract1.address, depositAmount)
      await token.connect(wallet).transfer(account1.address, depositAmount)
      await expect(preStakingContract1.connect(account1).deposit(depositAmount)).to.emit(preStakingContract1, 'StakeDeposited').withArgs(account1.address, depositAmount)

      const stake = await preStakingContract1.earned(account1.address)
      expect(stake).to.be.equal(BigNumber.from(0))

      const launchTimestamp = await preStakingContract1.launchTimestamp()
      await mineBlock(provider, launchTimestamp.add(10.5 * numberOfSecondsInOneDay).sub(1).toNumber())
      const stake1 = await preStakingContract1.earned(account1.address)

      const expectedReward = '4750'
      const actualReward = stake1.div(BigNumber.from(1))
      expect(actualReward).to.equal(expectedReward)
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
        preStakingConfig.amounts, preStakingConfig.daysInterval
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()

      await preStakingContract.connect(account1).deposit(depositAmount)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 63 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).executeWithdrawal()
    })

    it('8.1. should revert when calling again executeWithdrawal', async () => {
      const message = "There is no stake deposit for this account"
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(message)
    })
  })

  describe('9. Deposit lockup', () => {
    beforeEach(async () => {
      await preStakingContract.setLockupAddress(vaiLockup.address);
      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
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

    it('9.1. should revert when amoaunt equal 0', async () => {
      const message = "The stake deposit has to be larger than 0"
      await expect(preStakingContract.connect(account1).depositLockup(0)).to.be.revertedWith(message)
    })

    it('9.2. should revert when this address already have a stake', async () => {
      await preStakingContract.connect(account1).depositLockup(4)
      const message = "You already have a stake"
      await expect(preStakingContract.connect(account1).depositLockup(4)).to.be.revertedWith(message)
    })

    it('9.3. should revert when amount is too large', async () => {
      const message = "You don't have enough funds"
      await expect(preStakingContract.connect(account1).depositLockup(amount.add(100))).to.be.revertedWith(message)
    })

    it('9.4. should emit LockupStakeDeposited', async () => {
      await expect(preStakingContract.connect(account1).depositLockup(amount)).to.be.emit(preStakingContract, 'LockupStakeDeposited').withArgs(account1.address, amount)

      let isLockup = await preStakingContract.isLockup(account1.address)
      expect(isLockup).to.equal(true)
    })

    it('9.5. beneficiary current amount shoud decrease after deposit lockup', async () => {
      let currentAmount = await vaiLockup.beneficiaryCurrentAmount(account1.address)
      await expect(preStakingContract.connect(account1).depositLockup(amount)).to.be.emit(preStakingContract, 'LockupStakeDeposited').withArgs(account1.address, amount)
      let currentAmountAfterWithdraw = await vaiLockup.beneficiaryCurrentAmount(account1.address)

      expect(currentAmountAfterWithdraw).equal(currentAmount - 256)
    })
  })

  describe('10. Withdraw lockup', () => {
    beforeEach(async () => {
      await preStakingContract.setLockupAddress(vaiLockup.address);
      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
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

      await preStakingContract.connect(account1).depositLockup(amount)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 63 * numberOfSecondsInOneDay)

      await token.connect(wallet).transfer(rewardsWallet.address, rewardsAmount)
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
    })

    it('10.1. should revert if there is no deposit on the account', async () => {
      const message = "There is no stake deposit for this account"
      await expect(preStakingContract.connect(account3).withdrawLockup()).to.be.revertedWith(message)
    })

    it('10.2. should revert if deposit is not lockup', async () => {
      const message = "This deposit is not lockup"

      await token.connect(wallet).transfer(account3.address, depositAmount)
      await token.connect(account3).approve(preStakingContract.address, depositAmount)

      await preStakingContract.connect(account3).deposit(amount)
      await expect(preStakingContract.connect(account3).withdrawLockup()).to.be.revertedWith(message)
    })

    it('10.3. should emit LockupWithdrawExecuted', async () => {
      await expect(preStakingContract.connect(account1).withdrawLockup()).to.be.emit(preStakingContract, 'LockupWithdrawExecuted').withArgs(account1.address, amount, 8)
    })

    it('10.4. should revert after withdraw lockup', async () => {
      await expect(preStakingContract.connect(account1).withdrawLockup()).to.be.emit(preStakingContract, 'LockupWithdrawExecuted').withArgs(account1.address, amount, 8)
      const message = "There is no stake deposit for this account"
      await expect(preStakingContract.connect(account3).withdrawLockup()).to.be.revertedWith(message)
    })

    it('10.5. beneficiary current amount shoud increase after withdraw lockup', async () => {
      let currentAmount = await vaiLockup.beneficiaryCurrentAmount(account1.address)
      await expect(preStakingContract.connect(account1).withdrawLockup()).to.be.emit(preStakingContract, 'LockupWithdrawExecuted').withArgs(account1.address, amount, 8)
      let currentAmountAfterWithdraw = await vaiLockup.beneficiaryCurrentAmount(account1.address)
      expect(currentAmountAfterWithdraw).equal(currentAmount + amount)
    })
  })
})