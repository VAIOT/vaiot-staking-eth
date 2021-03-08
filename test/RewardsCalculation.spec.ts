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
    BigNumber.from("868230000000000000000000"),
    BigNumber.from("1065993000000000000000000"),
    BigNumber.from("1266453550000000000000000"),

    BigNumber.from("2728275640000000000000000"),
    BigNumber.from("2874789410000000000000000"),
    BigNumber.from("4925006190000000000000000"),

    BigNumber.from("6421500460000000000000000"),
    BigNumber.from("7398221620000000000000000"),
    BigNumber.from("8483673040000000000000000"),
    BigNumber.from("10000000000000000000000000")
  ],
  daysInterval: BigNumber.from(30),
  unstakingPeriod: BigNumber.from(7)
}

const depositAmount = BigNumber.from("1000000")
const rewardsAmount = BigNumber.from("4676921000000000000000000")
const depositThreshold = BigNumber.from("125000000000")
const bigDepositThreshold = expandTo18Decimals(5225000)

const rewardsConfig = {
  multiplier: BigNumber.from(2),
  rewardRates: [
    {
      anualRewardRate: BigNumber.from(35),
      lowerBound: BigNumber.from(0),
      upperBound: expandTo18Decimals(2500000)
    },
    {
      anualRewardRate: BigNumber.from(37),
      lowerBound: expandTo18Decimals(2500000),
      upperBound: expandTo18Decimals(5000000)
    },
    {
      anualRewardRate: BigNumber.from(39),
      lowerBound: expandTo18Decimals(5000000),
      upperBound: expandTo18Decimals(7500000)
    },
    {
      anualRewardRate: BigNumber.from(41),
      lowerBound: expandTo18Decimals(7500000),
      upperBound: expandTo18Decimals(10000000)
    },
  ]
}

const anualRewardRates = rewardsConfig.rewardRates.map(rewardRate => rewardRate.anualRewardRate.toString())
const lowerBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.lowerBound.toString())
const upperBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.upperBound.toString())

const numberOfSecondsInOneDay = 86400

describe('RewardsCalculation', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, rewardsWallet, account1, account2, account3, account4, account5, account6, account7, account8] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, rewardsWallet], provider)

  let token: Contract
  let preStakingContract: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(preStakingFixture)
    token = fixture.token
    preStakingContract = fixture.preStakingContract
  })

  describe('1. Reward is returned properly', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account1.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account2.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account3.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account4.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account5.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account6.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account7.address, bigDepositThreshold)
      await token.connect(wallet).transfer(account8.address, bigDepositThreshold)

      //allow staking contract
      await token.connect(wallet).approve(preStakingContract.address, bigDepositThreshold.mul(BigNumber.from(2)))
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account2).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account3).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account4).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account5).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account6).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account7).approve(preStakingContract.address, bigDepositThreshold)
      await token.connect(account8).approve(preStakingContract.address, bigDepositThreshold)

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
    })

    it('1.1 should return 48830 reward', async () => {
      const expectedReward = BigNumber.from('48830')
      // Computed via the spreadsheet
      const timestamp = (await provider.getBlock("latest")).timestamp

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account1).deposit(depositAmount)

      await mineBlock(provider, timestamp + 36 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(depositThreshold)

      await mineBlock(provider, timestamp + 42 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(depositThreshold)

      await mineBlock(provider, timestamp + 51 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(depositThreshold)

      await mineBlock(provider, timestamp + 128 * numberOfSecondsInOneDay)
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.emit(preStakingContract, 'WithdrawExecuted').withArgs(account1.address, depositAmount, expectedReward)
    })

    it('1.2', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(600000))
    })

    it('1.3', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(660000))
    })

    it('1.4', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(726000))
    })

    it('1.5', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))

      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))
      currentReward = currentReward.add(await preStakingContract.earned(account4.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(1452000))
    })

    it('1.6', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))

      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account5).deposit(preStakingConfig.amounts[4].sub(preStakingConfig.amounts[3]))

      await mineBlock(provider, timestamp + 150 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))
      currentReward = currentReward.add(await preStakingContract.earned(account4.address))
      currentReward = currentReward.add(await preStakingContract.earned(account5.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(1597200))
    })

    it('1.7', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))

      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account5).deposit(preStakingConfig.amounts[4].sub(preStakingConfig.amounts[3]))

      await mineBlock(provider, timestamp + 150 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account6).deposit(preStakingConfig.amounts[5].sub(preStakingConfig.amounts[4]))

      await mineBlock(provider, timestamp + 180 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))
      currentReward = currentReward.add(await preStakingContract.earned(account4.address))
      currentReward = currentReward.add(await preStakingContract.earned(account5.address))
      currentReward = currentReward.add(await preStakingContract.earned(account6.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(1756920))
    })

    it('1.8', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))

      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account5).deposit(preStakingConfig.amounts[4].sub(preStakingConfig.amounts[3]))

      await mineBlock(provider, timestamp + 150 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account6).deposit(preStakingConfig.amounts[5].sub(preStakingConfig.amounts[4]))

      await mineBlock(provider, timestamp + 180 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account7).deposit(preStakingConfig.amounts[6].sub(preStakingConfig.amounts[5]))

      await mineBlock(provider, timestamp + 210 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))
      currentReward = currentReward.add(await preStakingContract.earned(account4.address))
      currentReward = currentReward.add(await preStakingContract.earned(account5.address))
      currentReward = currentReward.add(await preStakingContract.earned(account6.address))
      currentReward = currentReward.add(await preStakingContract.earned(account7.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(1932612))
    })

    it('1.9', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))

      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account5).deposit(preStakingConfig.amounts[4].sub(preStakingConfig.amounts[3]))

      await mineBlock(provider, timestamp + 150 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account6).deposit(preStakingConfig.amounts[5].sub(preStakingConfig.amounts[4]))

      await mineBlock(provider, timestamp + 180 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account7).deposit(preStakingConfig.amounts[6].sub(preStakingConfig.amounts[5]))

      await mineBlock(provider, timestamp + 210 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account8).deposit(preStakingConfig.amounts[7].sub(preStakingConfig.amounts[6]))

      await mineBlock(provider, timestamp + 270 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))
      currentReward = currentReward.add(await preStakingContract.earned(account4.address))
      currentReward = currentReward.add(await preStakingContract.earned(account5.address))
      currentReward = currentReward.add(await preStakingContract.earned(account6.address))
      currentReward = currentReward.add(await preStakingContract.earned(account7.address))
      currentReward = currentReward.add(await preStakingContract.earned(account8.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(2125873))
    })

    it('1.10', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))

      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))

      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))

      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account5).deposit(preStakingConfig.amounts[4].sub(preStakingConfig.amounts[3]))

      await mineBlock(provider, timestamp + 150 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account6).deposit(preStakingConfig.amounts[5].sub(preStakingConfig.amounts[4]))

      await mineBlock(provider, timestamp + 180 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account7).deposit(preStakingConfig.amounts[6].sub(preStakingConfig.amounts[5]))

      await mineBlock(provider, timestamp + 210 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account8).deposit(preStakingConfig.amounts[7].sub(preStakingConfig.amounts[6]))

      await mineBlock(provider, timestamp + 270 * numberOfSecondsInOneDay)
      await preStakingContract.connect(wallet).deposit(preStakingConfig.amounts[9].sub(preStakingConfig.amounts[7]))

      await mineBlock(provider, timestamp + 300 * numberOfSecondsInOneDay)

      let currentReward = BigNumber.from(0)
      currentReward = currentReward.add(await preStakingContract.earned(account1.address))
      currentReward = currentReward.add(await preStakingContract.earned(account2.address))
      currentReward = currentReward.add(await preStakingContract.earned(account3.address))
      currentReward = currentReward.add(await preStakingContract.earned(account4.address))
      currentReward = currentReward.add(await preStakingContract.earned(account5.address))
      currentReward = currentReward.add(await preStakingContract.earned(account6.address))
      currentReward = currentReward.add(await preStakingContract.earned(account7.address))
      currentReward = currentReward.add(await preStakingContract.earned(account8.address))
      currentReward = currentReward.add(await preStakingContract.earned(wallet.address))

      await expect(currentReward).to.be.lte(expandTo18Decimals(4676921))
    })

    it('1.11', async () => {
      let baseRewardHistoryLength = await preStakingContract.baseRewardHistoryLength()
      expect(await preStakingContract.baseRewardIndex(baseRewardHistoryLength - 1)).to.be.equal(0)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 136 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(bigDepositThreshold)


      let baseRewardHistoryLength1 = await preStakingContract.baseRewardHistoryLength()
      expect(await preStakingContract.baseRewardIndex(baseRewardHistoryLength1 - 1)).to.be.equal(1)
    })

    it('1.12', async () => {
      await preStakingContract.connect(account1).deposit(depositAmount)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 330 * numberOfSecondsInOneDay)

      const currentReward = await preStakingContract.earned(account1.address)
      await expect(currentReward).to.be.equal(255139)
    })
  })
})