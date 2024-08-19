// Power Modes ENUM
const PowerModes = {
  ECO: 1,
  NORMAL: 0,
  MAX: 2,
};

// Operating Modes ENUM
const OperatingModes = {
  STOP: 0,
  PAUSE: 1,
  START: 2,
  RETURN: 3,
};

// Common properties for Vacuum ENUM
const Properties = {
  AREAS_TO_CLEAN: 'AreasToClean_V2',
  BATTERY_CAPACITY: 'Battery_Capacity',
  CHARGING_STATUS: 'Charging_Status',
  CLEAN_COMPLETE: 'CleanComplete',
  CLEANING_STATISTICS: 'Cleaning_Statistics',
  DOCKED_STATUS: 'DockedStatus',
  ERROR_CODE: 'Error_Code',
  EVACUATING: 'Evacuating',
  FIND_DEVICE: 'Find_Device',
  LOW_LIGHT_MISSION: 'LowLightMission',
  NAV_MODULE_FW_VERSION: 'Nav_Module_FW_Version',
  OPERATING_MODE: 'Operating_Mode',
  POWER_MODE: 'Power_Mode',
  RECHARGE_RESUME: 'Recharge_Resume',
  RECHARGING_TO_RESUME: 'Recharging_To_Resume',
  ROBOT_FIRMWARE_VERSION: 'Robot_Firmware_Version',
  ROBOT_ROOM_LIST: 'Robot_Room_List',
  RSSI: 'RSSI',
  DEVICE_MODEL_NUMBER: 'Device_Model_Number',
  DEVICE_SERIAL_NUMBER: 'Device_Serial_Num',
};

// Error messages enum
const ERROR_MESSAGES = {
  1: 'Side wheel is stuck',
  2: 'Side brush is stuck',
  3: 'Suction motor failed',
  4: 'Brushroll stuck',
  5: 'Side wheel is stuck (2)',
  6: 'Bumper is stuck',
  7: 'Cliff sensor is blocked',
  8: 'Battery power is low',
  9: 'No Dustbin',
  10: 'Fall sensor is blocked',
  11: 'Front wheel is stuck',
  13: 'Switched off',
  14: 'Magnetic strip error',
  16: 'Top bumper is stuck',
  18: 'Wheel encoder error',
};

export { PowerModes, OperatingModes, Properties, ERROR_MESSAGES };
