#!/bin/bash
# Runs every 5 min to fetch fresh signals + alerts from all sources
cd /home/workspace/nexus/server
nohup python3 -u scraper.py >> /tmp/nexus_scraper.log 2>&1 &
echo "Scraper PID=$!"
