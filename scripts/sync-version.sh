#!/bin/bash

# Script to sync package.json version with git tags
# Usage: ./scripts/sync-version.sh [tag-name]
# If no tag is provided, uses the latest version tag

set -e

# Function to display usage
usage() {
    echo "Usage: $0 [tag-name]"
    echo "  tag-name: Optional. Git tag in format v1.2.3"
    echo "  If no tag provided, uses the latest version tag"
    echo ""
    echo "Examples:"
    echo "  $0           # Use latest tag"
    echo "  $0 v1.2.3    # Use specific tag"
    exit 1
}

# Function to validate version format
validate_version() {
    local version=$1
    if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+.*$ ]]; then
        echo "❌ Invalid version format: $version"
        echo "   Expected format: x.y.z (e.g., 1.2.3)"
        exit 1
    fi
}

# Function to validate tag format
validate_tag() {
    local tag=$1
    if [[ ! $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+.*$ ]]; then
        echo "❌ Invalid tag format: $tag"
        echo "   Expected format: vx.y.z (e.g., v1.2.3)"
        exit 1
    fi
}

# Get target tag
if [ $# -eq 0 ]; then
    # No arguments - use latest tag
    target_tag=$(git describe --tags --abbrev=0 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -z "$target_tag" ]; then
        echo "❌ No version tags found in repository"
        echo "   Create a tag first: git tag v1.0.0"
        exit 1
    fi
    echo "🔍 Using latest version tag: $target_tag"
elif [ $# -eq 1 ]; then
    # One argument - use provided tag
    target_tag=$1
    validate_tag "$target_tag"
    
    # Check if tag exists
    if ! git rev-parse "$target_tag" >/dev/null 2>&1; then
        echo "❌ Tag '$target_tag' does not exist"
        echo "   Create it first: git tag $target_tag"
        exit 1
    fi
    echo "🎯 Using specified tag: $target_tag"
else
    usage
fi

# Extract version from tag
version=$(echo $target_tag | sed 's/^v//')
validate_version "$version"

# Get current version from package.json
current_version=$(node -p "require('./package.json').version" 2>/dev/null)

if [ -z "$current_version" ]; then
    echo "❌ Could not read version from package.json"
    exit 1
fi

echo "📦 Current package.json version: $current_version"
echo "🏷️  Target version from tag: $version"

if [ "$current_version" = "$version" ]; then
    echo "✅ Version already matches - no changes needed"
    exit 0
fi

# Update package.json version
echo "🔄 Updating package.json version..."
npm version $version --no-git-tag-version --allow-same-version

if [ $? -eq 0 ]; then
    echo "✅ Successfully updated package.json version to $version"
    echo ""
    echo "📝 Changes made:"
    echo "   package.json version: $current_version → $version"
    echo ""
    echo "💡 Next steps:"
    echo "   git add package.json"
    echo "   git commit -m \"chore: bump version to $version\""
else
    echo "❌ Failed to update package.json version"
    exit 1
fi
