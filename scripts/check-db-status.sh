#!/bin/bash

# Function to check status
check_status() {
    local env_file=$1
    local env_name=$2
    
    echo "============================================"
    echo "Checking ${env_name} database status..."
    echo "Loading variables from ${env_file}..."
    
    if [ ! -f "$env_file" ]; then
        echo "Error: ${env_file} not found."
        return
    fi

    # Run in a subshell to isolate environment variables
    (
        # Load environment variables from the specified file
        # Handle lines with comments or empty lines appropriately
        export $(grep -v '^#' "$env_file" | xargs)
        
        # Check connection and migration status
        npx prisma migrate status
    )
}

# Check DEV
check_status ".env.DEV" "DEV"

echo ""

# Check PRODUCTION
check_status ".env.PRODUCTION" "PRODUCTION"
