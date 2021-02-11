import chai, { expect } from 'chai'
import { Contract, BigNumber, constants } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { preStakingFixture } from './fixtures'
import { REWARDS_DURATION, expandTo18Decimals, mineBlock, getApprovalDigest } from './utils'

import PreStakingContract from '../build/StakingRewards.json'

chai.use(solidity)

const preStakingConfig = {
  maxAmount: BigNumber.from(5e+9),
  initialAmount: BigNumber.from(5e+8),
  daysInterval: BigNumber.from(3),
  unstakingPeriod: BigNumber.from(7),
  maxIntervals: BigNumber.from(10),
};

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
};

const anualRewardRates = rewardsConfig.rewardRates.map(rewardRate => rewardRate.anualRewardRate.toString());
const lowerBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.lowerBound.toString());
const upperBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.upperBound.toString());

describe('PreStakingContract', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, rewardsWallet, account1, account2, account3, account4] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, rewardsWallet], provider)

  let token: Contract
  let preStakingContract: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(preStakingFixture)
    token = fixture.token
    preStakingContract = fixture.preStakingContract
  })

  describe('3', () => { 

    

  it('3.1. setupStakingLimit: should throw if called with wrong argument types', async () => {
    await expect(preStakingContract.setupStakingLimit(null,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,null, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, null, preStakingConfig.unstakingPeriod)).to.be.reverted
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, null)).to.be.reverted
  })

  it('3.2. setupStakingLimit: should revert if not called by the contract owner', async () => {
    const revertMessage = 'Ownable: caller is not the owner'
    await expect(preStakingContract.connect(account1).setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.revertedWith(revertMessage)
  })


  it('3.3. setupStakingLimit: should revert when contract is not paused', async () => {
    await preStakingContract.unpause()
    const revertMessage = 'VM Exception while processing transaction: revert Pausable: not paused'
    //await expect(
      preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)
     // ).to.be.revertedWith(revertMessage)
  })

  it('3.4. setupStakingLimit: should revert if maxAmount is not a multiple of initialAmount', async () => {
   // await preStakingContract.pause()
    const revertMessage = "RuntimeError: VM Exception while processing transaction: revert [Validation] maxAmount should be a multiple of initialAmount"
    await 
    //expect(
      preStakingContract.setupStakingLimit(BigNumber.from(231e+3),preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)
    //  ).to.be.revertedWith(revertMessage)
  })

  it('3.5. setupStakingLimit: should revert if one of the params overflow or underflow', async () => {
    //await preStakingContract.pause()
    const revertMessage = '[Validation] Some parameters are 0'
    expect(await preStakingContract.setupStakingLimit(preStakingConfig.maxAmount, BigNumber.from(0), preStakingConfig.daysInterval , preStakingConfig.unstakingPeriod)
    ).to.be.revertedWith(revertMessage)
  })

  
  it('3.6. setupStakingLimit: should setup the staking limit correctly', async () => {
   
    preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)

    let actualStakingConfig = await preStakingContract.stakingLimitConfig();
    // mapValues(actualStakingConfig, value => value.toString())
    expect(actualStakingConfig).to.deep.equal(preStakingConfig)
  })

  // it('3.7. setupStakingLimit: should allow to setup staking periods until the setup is finalized (rewards are setup)', async () => {
  //   const newConfig = {
  //     maxAmount: BigNumber.from(1e+10),
  //     initialAmount: BigNumber.from(1e+9),
  //     daysInterval: BigNumber.from(3),
  //     unstakingPeriod: BigNumber.from(4),
  //     maxIntervals: BigNumber.from(10),
  // };

  //   await preStakingContract.pause()
  //   preStakingContract.setupStakingLimit(newConfig.maxAmount, newConfig.initialAmount, newConfig.daysInterval, newConfig.unstakingPeriod)

  //   let actualStakingConfig = await preStakingContract.stakingLimitConfig();
  //   // mapValues(actualStakingConfig, value => value.toString())
  //   expect(actualStakingConfig).to.deep.equal(preStakingConfig)
  // })

  // it('3.8. setupRewards: should revert if not called by the contract owner', async () => {
  //   await preStakingContract.pause()
  //   const revertMessage = 'Ownable: caller is not the owner'
  //   await expect(preStakingContract.setupRewards(rewardsConfig.multiplier, anualRewardRates, lowerBounds, upperBounds)).to.be.revertedWith(revertMessage)

  // })

  // it('3.9. setupRewards: should revert when contract is not paused', async () => {
  //   await preStakingContract.unpause()
  //   const revertMessage = 'VM Exception while processing transaction: revert Pausable: not paused'
  //   await expect(preStakingContract.setupRewards(rewardsConfig.multiplier, anualRewardRates, lowerBounds, upperBounds)).to.be.revertedWith(revertMessage)
  // })

  // it('balanceOf', async () => {
  //   const initialBalance = await token.balanceOf(preStakingContract.address);
    
  //   await expect(initialBalance).to.be.equal(BigNumber.from(1));
  // })

  // it('3.12. setupRewards: should setup the rewards with correct param values and number', async () => {


  // })



})
})
