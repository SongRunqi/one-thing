# macOS Automation Guide

This guide covers using `osascript` to interact with macOS native applications.

## Notes App

### Create a note
```bash
osascript -e 'tell application "Notes"
    tell default account
        make new note at first folder with properties {name:"Title", body:"Content"}
    end tell
end tell'
```

### List notes
```bash
osascript -e 'tell application "Notes" to get name of every note of first folder of default account'
```

---

## Reminders App

### Create a reminder with due date
```bash
osascript -e 'tell application "Reminders"
    set dueDate to (current date) + (1 * days)
    make new reminder in default list with properties {name:"Task", due date:dueDate}
end tell'
```

### List reminders
```bash
osascript -e 'tell application "Reminders" to get name of every reminder in default list'
```

---

## Mail App

### Send email
```bash
osascript -e 'tell application "Mail"
    set msg to make new outgoing message with properties {subject:"Subject", content:"Body", visible:true}
    tell msg to make new to recipient with properties {address:"email@example.com"}
end tell'
```

### Read inbox messages (first 10)
```bash
osascript -e 'tell application "Mail"
    set msgList to messages of inbox
    set msgCount to count of msgList
    set output to "Total: " & msgCount & " messages" & linefeed
    if msgCount > 10 then set msgCount to 10
    repeat with i from 1 to msgCount
        set m to item i of msgList
        set output to output & subject of m & " | " & sender of m & linefeed
    end repeat
    return output
end tell'
```

---

## Calendar App

### Create an event
```bash
osascript -e 'tell application "Calendar"
    set startDate to (current date) + (1 * days)
    set hours of startDate to 10
    set minutes of startDate to 0
    set endDate to startDate + (1 * hours)
    tell first calendar
        make new event with properties {summary:"Meeting", start date:startDate, end date:endDate}
    end tell
end tell'
```

### List today's events
```bash
osascript -e 'tell application "Calendar"
    set today to current date
    set time of today to 0
    set tomorrow to today + (1 * days)
    set output to ""
    repeat with cal in calendars
        set evts to (every event of cal whose start date ≥ today and start date < tomorrow)
        repeat with e in evts
            set output to output & summary of e & " at " & (start date of e) & linefeed
        end repeat
    end repeat
    return output
end tell'
```

---

## Finder

### Open a folder
```bash
osascript -e 'tell application "Finder" to open folder "Documents" of home'
```

### Get selected files
```bash
osascript -e 'tell application "Finder" to get selection as alias list'
```

---

## System Operations

### Get clipboard content
```bash
osascript -e 'the clipboard'
```

### Set clipboard content
```bash
osascript -e 'set the clipboard to "text content"'
```

### Show notification
```bash
osascript -e 'display notification "Message" with title "Title"'
```

### Open URL
```bash
open "https://example.com"
```

### Open application
```bash
open -a "Application Name"
```

---

## Tips

- Use `current date` for relative date calculations
- Use `first folder` or `default account` when targeting default locations
- Add `visible:true` to Mail messages to show them before sending
- Calendar events require both `start date` and `end date`
