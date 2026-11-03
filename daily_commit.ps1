$ErrorActionPreference = "Stop"

# Get untracked and modified files
$untracked = git ls-files --others --exclude-standard
$modified = git ls-files -m
$all_files = $untracked + $modified | Select-Object -Unique

if ($all_files.Count -eq 0) {
    Write-Host "No files left to commit! You are done!"
    exit 0
}

$limit = 10
if ($all_files.Count -lt $limit) {
    $limit = $all_files.Count
}

for ($i = 0; $i -lt $limit; $i++) {
    $file = $all_files[$i]
    $filename = Split-Path $file -Leaf
    
    # Generate distinct messages
    $msg = "feat: add $filename"
    if ($file -match "\.tsx?$") {
        $msg = "ui: design and implement $filename"
    } elseif ($file -match "\.py$") {
        $msg = "backend: develop $filename logic"
    } elseif ($file -match "package") {
        $msg = "chore: configure dependencies in $filename"
    } elseif ($file -match "\.yml|\.yaml|\.json") {
        $msg = "config: update $filename structure"
    }
    
    git add $file
    git commit -m $msg
}

# Push to GitHub
git push origin main
Write-Host "Successfully committed and pushed $limit files today!"
