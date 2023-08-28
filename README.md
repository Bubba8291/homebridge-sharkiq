<span align="center">

# Homebridge Shark Clean Vacuum Plugin

</span>

A very, very, very messy plugin for SharkIQ Vacuums.

I didn't get to spend a lot of time on this, so contribution would be awesome to make it better and more stable. I used the [sharkiq](https://github.com/JeffResc/sharkiq/) python module as a reference for creating the javascript wrapper to control SharkIQ Vacuums.

This plguin has only been tested on the `UR250BEXUS` model.

## Install and Setup

### Step 1.

Run `npm install -g homebridge-sharkiq`

### Step 2.

Configure Homebridge. The config file for SharkIQ should include:
```
{
    ...
    "platforms": [
        {
            "name": "SharkIQPlugin",
            "platform": "SharkIQ",
            "email": "[Shark Clean Account Email]",
            "password": "[Shark Clean Account Password]",
            "vacuums": [
                "[Shark Vacuum Serial Number]",
                ...
            ]
        }
    ]
}
```

The email and password is your Shark Clean account you used to setup the vacuum. The Vacuums array is a list of your vacuum's serial numbers. If you only have one vacuum, just include the one's serial number.

## Features

- Be able to turn on and off the vacuum
- Set the power mode of the vacuum and change it while running
- Sensor for if the vacuum is docked or not
- Pause switch for pausing the vacuum while it's running

## Notes

This plugin is really, REALLY, buggy. Sometimes the vacuum won't turn on or off from Homebridge the first time, and you have to toggle it a second time.

Contributions would be very helpful to help this Homebridge plugin stay maintained and up to date. If you have any problems, please create an issue.

## Useful Links
- [SharkIQ Python](https://github.com/JeffResc/sharkiq/)
