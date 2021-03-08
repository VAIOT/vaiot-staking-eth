pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "interfaces/IVAILockup.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract VAILockup is IVAILockup {
    
    using Address for address;

    IERC20 private _token;

    struct Lockup {
        address beneficiary;
        uint256 initialAmount;
        uint256 currentAmount;
        uint256 rewardsAmount;
        uint256 partsLeft;
        bool stake;
    }

    uint256 public interval;
    uint256 public startTime;
    uint256 public numberOfParts; 

    Lockup[] private _lockups;

    mapping (address => uint) private _beneficiaryToLockup;

    address private _excessRecipient;

    address private _stakingAddress;

    constructor (address token_, uint256 interval_, uint256 numberOfParts_)
    onlyContract(token_)
    public {
        _token = IERC20(token_);
        interval = interval_;
        numberOfParts = numberOfParts_;
        startTime = now;
    }

    modifier onlyStaking() {
        require(msg.sender == _stakingAddress, "[Validation] This address is not staking address");
        _;
    }

     modifier onlyContract(address account)
    {
        require(account.isContract(), "[Validation] The address does not contain a contract");
        _;
    }

    /**
     * @return the token being held.
     */
    function token() public view returns (IERC20) {
        return _token;
    }

    /**
     * @return the the lockup amount for the beneficiary.
     */
    function beneficiaryCurrentAmount(address beneficiary) public view returns (uint256) {
        return _lockups[_beneficiaryToLockup[beneficiary]].currentAmount;
    }

    function lock(address beneficiary, uint256 amount) public {
        require((amount % numberOfParts) == uint256(0), "The amount must be divisible by the number of parts");
       
        uint lockupIndex = _lockups.push(Lockup(beneficiary, amount, amount, 0, numberOfParts, false)) - 1;
        _beneficiaryToLockup[beneficiary] = lockupIndex;

        require(token().transferFrom(msg.sender, address(this), amount), "Something went wrong during the token transfer");
    }

    function unlock(address beneficiary) public {
        Lockup storage lockup = _lockups[_beneficiaryToLockup[beneficiary]];

        require(lockup.stake == false, "Lockup amount is staked");
        require(now >= (startTime + (interval * 1 days * (numberOfParts - lockup.partsLeft + 1))), "Not enough days passed");

        token().transfer(beneficiary, lockup.initialAmount / numberOfParts + lockup.rewardsAmount);
        
        lockup.partsLeft -= 1;
        lockup.rewardsAmount = 0;
        lockup.currentAmount -= lockup.initialAmount / numberOfParts;
    }

    function setStakingAddress(address staking) 
    onlyContract(staking)
    public {
        _stakingAddress = staking;
        token().approve(staking, token().totalSupply());
    }

    function stake(address beneficiary, uint256 stakeAmount)
    public
    onlyStaking
    {
        Lockup storage lockup = _lockups[_beneficiaryToLockup[beneficiary]];
        lockup.stake = true;
        lockup.currentAmount -= stakeAmount;
    }

    function unstake(address beneficiary, uint256 stakeAmount, uint256 rewardsAmount)
    public
    onlyStaking
    {
        Lockup storage lockup = _lockups[_beneficiaryToLockup[beneficiary]];
        lockup.stake = false;
        lockup.currentAmount += stakeAmount;
        lockup.rewardsAmount += rewardsAmount;
    }
}