# LOGGER DOCUMENTATION
## LOOGER CONFIG
logger configuration is in every module config.ts file
```js
logger: {
    keeping_days_in_db: 10,
    terminal_logs: true,
    db_logs: true,
    file_logs: true,
    db_logs_path: path.resolve(process.cwd(), 'data', 'app-logs.db'),
    file_logs_path: path.resolve(process.cwd(), 'logs', `${module_name}.log`),
  },
```
## Notes
- console.log it's overrided function for orignal console.log
- all 3 methods db, console, file can be used simultaneously
- logger should be initialized in the main index.ts file
- table name in db can be taken from config.ts name field
- saving logs to file or db should be happen before every new cycle starts cycle starts from number 1 so if it became 2 it's mean we need save all collected logs for this time
- we need clean logs base on logger config keeping_days_in_db field
- if cycle is not provided we set it as 0 and save in db as 0
- all code for logger should be in logger.ts file
- cleaning logs should be done once a day

## LOGGER DB TEMPLATE
id - `id` - id of the log
date - `date` - date of the log
time - `time` - time of the log
run_prefix - `run_prefix` - prefix of the run, unique value for every run, in case if if program runs multiple times per day we need to ceparate cycles
full_message - `full_message` - fullmessage of the log
message - `message` - message of the log
module - `module` - module of the log
function - `function` - function of the log
type - `type` - type of the log, can be `info`, `error`, `warn`
data - `data` - additional data for the log as json string
cycle - `cycle` - number of the cycle
tag - `tag` - any additional tag for the logs, for example if cycle finished with some swap action it's can be `swap_action`

## LOGGER FILE TEMPLATE
```
************************* [date] [time] *********************
[module] [function] [type] [tag]
[message]
[data] - pretty json string
*************************************************************
```

## Use Examples 
`console.log("Message", "processRunCounter", data, tag)`
`console.error("Message", "processRunCounter", data, tag)`
`console.warn("Message", "processRunCounter", data, tag)`

Message - `[module]|[function]| Message` - Message to log. 
processRunCounter - `processRunCounter` - counter to divide logs by every run in multi thread application where all logs mixed
data - `data` - additional data for the logs
tag - `tag` - any additional tag for the logs, for example if cycle finished with some swap action it's can be `swap_action`

## LOGGER INITIALIZATION
```js
logger.init();
```

## Logger UI
takes data from db logs by api , as result grouped logs

Collapsed view
- date(highlighted with a tag, error, warning, info) -+-
    - [modules] -+-
        - [ mainLogs(highlighted with a tag, error, warning, info)] -+-
        - [ cycleLogs(highlighted with a tag, error, warning, info)] -+-
            - [cycle][type][time][function][message] [tag] -+-
              - [data]

