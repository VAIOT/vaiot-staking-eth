import chai, { expect } from 'chai'
const _ = require('lodash');

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

const Status = {
  Setup: 0,
  Running: 1,
  RewardsDisabled: 2,
};

const depositAmount = BigNumber.from(1e+6);
const rewardsAmount = BigNumber.from(400e+6);
const stakingConfig = {
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
    await expect(preStakingContract.setupStakingLimit(null,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,null, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, null, preStakingConfig.unstakingPeriod)).to.be.reverted
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, null)).to.be.reverted
  })

  it('3.2. setupStakingLimit: should revert if not called by the contract owner', async () => {
    const revertMessage = 'Ownable: caller is not the owner'
    await expect(preStakingContract.connect(account1).setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
  })

  it('3.3. setupStakingLimit: should revert when contract is not paused', async () => {
    await preStakingContract.unpause()
    const revertMessage = 'VM Exception while processing transaction: revert Pausable: not paused'
    await expect(preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
    await preStakingContract.pause()
  })

  it('3.4. setupStakingLimit: should revert if maxAmount is not a multiple of initialAmount', async () => {
    const revertMessage = "VM Exception while processing transaction: revert [Validation] maxAmount should be a multiple of initialAmount"
    await expect(preStakingContract.setupStakingLimit(BigNumber.from(231e+3),preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)).to.be.reverted
  })

  it('3.5. setupStakingLimit: should revert if one of the params overflow or underflow', async () => {
    const revertMessage = '[Validation] Some parameters are 0'
    await expect( preStakingContract.setupStakingLimit(preStakingConfig.maxAmount, BigNumber.from(0), preStakingConfig.daysInterval , preStakingConfig.unstakingPeriod)).to.be.reverted
  })
  
  it('3.6. setupStakingLimit: should setup the staking limit correctly', async () => {
    await preStakingContract.setupStakingLimit(preStakingConfig.maxAmount,preStakingConfig.initialAmount, preStakingConfig.daysInterval, preStakingConfig.unstakingPeriod)

    let actualStakingConfig = await preStakingContract.stakingLimitConfig()
    actualStakingConfig = _.pick(actualStakingConfig, _.keys(stakingConfig))
    actualStakingConfig = _.mapValues(actualStakingConfig, {String})
    const expectedStakingConfig = _.mapValues(stakingConfig, {String})
    
    expect(actualStakingConfig).to.deep.equal(expectedStakingConfig)
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

  // it('balanceOf', async () => {
  //   const initialBalance = await token.balanceOf(preStakingContract.address);
    
  //   await expect(initialBalance).to.be.equal(BigNumber.from(1));
  // })

  // it('3.12. setupRewards: should setup the rewards with correct param values and number', async () => {


  // })

  it('3.13. setupRewards: should initialize the base rewards history with the first BaseReward which is also the smallest', async () => {
    expect((await preStakingContract.baseRewardHistoryLength()).toString()).to.equal('1');
  })

  it('3.14. setupRewards: should set the status to Running when the staking is configured', async () => {
    expect((await preStakingContract.currentStatus()).toNumber).to.equal(Status.Running);
  })

  it('3.15. setupRewards: should revert when contract is already setup', async () => {
    const revertMessage = '[Lifecycle] Setup is already done';
    await expect(preStakingContract.setupRewards(
                rewardsConfig.multiplier,
                anualRewardRates,
                lowerBounds,
                upperBounds
            )).to.be.reverted
  })
})

  describe('4. Deposit and withdraw', () => { 
    it('4.1. deposit: should revert when contract is not setup', async () => {
      const revertMessage = '[Lifecycle] Setup is already done';
      await expect(preStakingContract.deposit(depositAmount)).to.be.reverted
    })

    it('4.2. deposit: should throw if called with wrong argument types', async () => {
      await preStakingContract.setupStakingLimit(
        stakingConfig.maxAmount, stakingConfig.initialAmount, stakingConfig.daysInterval, stakingConfig.unstakingPeriod
      );
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      );

      await expect(preStakingContract.deposit('none')).to.be.reverted
    })

    it('4.3. deposit: should revert when contract is paused', async () => {
      const revertMessage = 'Pausable: paused';
      await expect(preStakingContract.deposit(depositAmount)).to.be.reverted
      await preStakingContract.unpause();
    })
    it('4.4. deposit: should revert if deposit is called with an amount of 0', async () => {
      const message = "[Validation] The stake deposit has to be larger than 0";
      await expect(preStakingContract.deposit('0')).to.be.revertedWith(message)
    })
    it('4.5. deposit: should revert if the account already has a stake deposit', async () => {
      const message = "[Deposit] You already have a stake";
      preStakingContract.connect(account1).deposit(depositAmount);
      await expect(preStakingContract.connect(account1).deposit(depositAmount)).to.be.reverted
    })
    it('4.6. deposit: should revert if the transfer fails because of insufficient funds', async () => {
      const exceedsBalanceMessage = "ERC20: transfer amount exceeds balance.";
      await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.be.revertedWith(exceedsBalanceMessage)
      await token.mint(account2, depositAmount);
      const exceedsAllowanceMessage = "ERC20: transfer amount exceeds allowance.";
      await expect(preStakingContract.connect(account2).deposit(depositAmount)).to.be.revertedWith(exceedsAllowanceMessage)
    })

    // it('4.7. deposit: should create a new deposit for the depositing account and emit StakeDeposited(msg.sender, amount)', async () => {
    //   const eventData = {
    //       account: account2,
    //       amount: depositAmount
    //   };

    //   const initialBalance = await token.balanceOf(preStakingContract.address);
    //   await token.connect(account2).approve(preStakingContract.address, depositAmount);
    //   const {logs} = await preStakingContract.connect(account2).deposit(depositAmount);
    //   const currentBalance = await token.balanceOf(preStakingContract.address);
    //   expectEvent.inLogs(logs, 'StakeDeposited', eventData);
    //   expect(initialBalance.add(depositAmount)).to.be.bignumber.equal(currentBalance);
    // })

    // it('4.8. deposit: should have current total stake less than current maximum staking limit', async () => {
    //   const totalStake = await preStakingContract.currentTotalStake();
    //   const currentMaxLimit = await preStakingContract.currentStakingLimit();

    //   expect(totalStake).to.be.bignumber.below(currentMaxLimit);
    //   expect(currentMaxLimit).to.be.bignumber.equal(stakingConfig.initialAmount);
    // });

    it('4.9. deposit: should revert if trying to deposit more than the first wave limit (5 * 10^8)', async () => {
      const revertMessage = "[Deposit] Your deposit would exceed the current staking limit";
      await token.mint(account3, stakingConfig.initialAmount);

      await expect(preStakingContract.connect(account3).deposit(stakingConfig.initialAmount)).to.be.revertedWith(revertMessage)
  });

  it('4.10. initiateWithdrawal: should revert when contract is paused', async () => {
      await preStakingContract.pause();
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.reverted("Pausable: paused");
      await preStakingContract.unpause();
  });

  // it('4.12. initiateWithdrawal: should revert if minimum staking period did not pass', async () => {
  //     const revertMessage = "[Withdraw] Not enough days passed";
  //     // 0 Days passed
  //     await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)

  //     // 26 Days passed
  //     await time.increase(time.duration.days(26))
  //     await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)

  //     // 27 Days passed
  //     await time.increase(time.duration.days(1))
  //     await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)
  // });

  // it('4.13. initiateWithdrawal: should revert if the account has no stake deposit', async () => {
  //     // 30 Days passed
  //     await time.increase(time.duration.days(3));
  //     const revertMessage = "[Initiate Withdrawal] There is no stake deposit for this account";
  //     await expect(preStakingContract.connect(unauthorized).initiateWithdrawal()).to.be.revertedWith(revertMessage)
  // });

  it('4.14. initiateWithdrawal: should emit the WithdrawInitiated(msg.sender, stakeDeposit.amount) event', async () => {
      const eventData = {
          account: account1,
          amount: depositAmount,
      };
     // const {logs} = await preStakingContract.connect(account1).initiateWithdrawa()
     // expectEvent.inLogs(logs, 'WithdrawInitiated', eventData);
      expect(preStakingContract.connect(account1).initiateWithdrawa()).to.emit(preStakingConfig, 'WithdrawInitiated')
     
  });

  it('4.15. initiateWithdrawal: should revert if account has already initiated the withdrawal', async () => {
      const revertMessage = "[Initiate Withdrawal] You already initiated the withdrawal";
      await expect(preStakingContract.connect(account1).initiateWithdrawal()).to.be.revertedWith(revertMessage)
  });

  it('4.16. executeWithdrawal: should revert when contract is paused', async () => {
      const revertMessage = "Pausable: paused";
      await preStakingContract.pause();
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
      await preStakingContract.unpause();
  });

  it('4.17. executeWithdrawal: should revert if there is no deposit on the account', async () => {
      const revertMessage = "[Withdraw] There is no stake deposit for this account";
      await expect(preStakingContract.executeWithdrawal(), revertMessage);
  });

  it('4.18. executeWithdrawal: should revert if the withdraw was not initialized', async () => {
      const revertMessage = "[Withdraw] Withdraw is not initialized";
      await expect(preStakingContract.connect(account2).executeWithdrawal()).to.be.revertedWith(revertMessage)
  });

  it('4.19. executeWithdrawal: should revert if unstaking period did not pass', async () => {
      const revertMessage = '[Withdraw] The unstaking period did not pass';
      await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
  });

  // it('4.20. executeWithdrawal: should revert if transfer fails on reward', async () => {
  //     const revertMessage = "ERC20: transfer amount exceeds allowance";

  //     await time.increase(time.duration.days(stakingConfig.unstakingPeriod));

  //     await token.connect(rewardsWallet).decreaseAllowance(
  //         preStakingContract.address,
  //         rewardsAmount.sub(BigNumber.from(123))
  //     );

  //     await expect(preStakingContract.connect(account1).executeWithdrawal()).to.be.revertedWith(revertMessage)
  // });

  // it('4.21. currentReward(): should return the stake deposit and current reward for a specified account', async () => {
  //     const currentReward = await preStakingContract.currentReward(account1);

  //     expect(currentReward[0]).to.be.bignumber.equal(depositAmount);
  //     expect(currentReward[1]).to.be.bignumber.above(BigNumber.from(0));
  // });

  // it('4.22. getStakeDeposit(): should return the current the stake deposit for the msg.sender', async () => {
  //     const stakeDeposit = await preStakingContract.connect(account1).getStakeDeposit();

  //     expect(stakeDeposit[0]).to.be.bignumber.equal(depositAmount);
  // });

  // it('4.22. executeWithdrawal: should transfer the initial staking deposit and the correct reward and emit WithdrawExecuted', async () => {
  //     await token.connect(rewardsWallet).increaseAllowance(
  //         preStakingContract.address,
  //         rewardsAmount.sub(BigNumber.from(123))
  //     );
  //     const initialTotalStake = await preStakingContract.currentTotalStake();
  //     const {logs} = await preStakingContract.connect(account1).executeWithdrawal();
  //     const currentTotalStake = await preStakingContract.currentTotalStake();

  //     const eventData = {
  //         account: account1,
  //         amount: depositAmount,
  //     };

  //     expectEvent.inLogs(logs, 'WithdrawExecuted', eventData);
  //     expect(currentTotalStake).to.be.bignumber.equal(initialTotalStake.sub(depositAmount));
  // });

  });

  describe('5. Disable rewards', () => { 
    beforeEach( async () => {
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

    it('should allow only the owner to disable rewards', async () => {
        const msg = "Ownable: caller is not the owner"
        await expect(preStakingContract.connect(unauthorized).toggleRewards(true)).to.be.revertedWith(msg)
    })

    it("should reduce the reward to half if rewards are disabled for 15 out of 30 days", async () => {

       //Account 1
        await preStakingContract.connect(account1).deposit(depositAmount)
       
        const timestamp = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp + 1296000)
        await preStakingContract.toggleRewards(false)

        const timestamp1 = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp1 + 1296000)
        await preStakingContract.connect(account1).initiateWithdrawal()

        const timestamp2 = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp2 + 691200)
        await preStakingContract.connect(account1).executeWithdrawal()
        let reward1 = BigNumber.from(0)
        let reward2 = BigNumber.from(0)
        preStakingContract.on("WithdrawExecuted", (account, amount, reward) => {
          if (account == account1.address) {
            reward1 = reward
          } else if (account == account2.address) {
            reward2 = reward
            expect(reward1).to.be.equal(reward2.div(BigNumber.from(2)));
          }
        })

        //Account 2
        await preStakingContract.toggleRewards(true);
        await preStakingContract.connect(account2).deposit(depositAmount)
        const timestamp3 = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp3 + 2592000)
        await preStakingContract.connect(account2).initiateWithdrawal();
        const timestamp4 = (await provider.getBlock("latest")).timestamp
        await mineBlock(provider, timestamp4 + 691200)
        await preStakingContract.connect(account2).executeWithdrawal();
    })
  })

})