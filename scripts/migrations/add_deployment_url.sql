-- Add deployment_url column to tools table
-- Run this SQL in your Supabase SQL Editor

ALTER TABLE tools 
ADD COLUMN IF NOT EXISTS deployment_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tools_deployment_url ON tools(deployment_url);

-- Add comment
COMMENT ON COLUMN tools.deployment_url IS 'Public URL where the MCP server is deployed (e.g., Railway, Fly.io)';
