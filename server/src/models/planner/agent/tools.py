import difflib
from pathlib import Path
from langchain_core.tools import tool
from langgraph.types import interrupt

from ..schema import SuggestedFileEditSchema

#TODO: Needs to reformat or check if this tool actually works
@tool(args_schema=SuggestedFileEditSchema)
async def suggest_file_edits(
    file_path: str,
    target_block: str,
    replacement_block: str,
    apply_changes: bool
) -> str:
    target_file_path = Path(file_path)

    if not target_file_path.exists():
        return f"Error: File {target_file_path} does not exist"
    if not target_file_path.is_file():
        return f"Error: File {target_file_path} is not an accessible file"
    try:
        content = target_file_path.read_text(encoding="utf-8")
    except Exception as e:
        return f"Error reading file {target_file_path}: {e}"

    modified_file_content = content.replace(target_block, replacement_block, 1)

    if not apply_changes:
        return (
            f"Suggested edit for: {target_file_path}\n\n"
            f"--- Current ---\n"
            f"{target_block}\n\n"
            f"--- Suggested ---\n"
            f"{replacement_block}\n\n"
            f"No changes were applied."
        )

    try:
        target_file_path.write_text(
            modified_file_content,
            encoding="utf-8"
        )
    except Exception as e:
        return f"Error writing file {target_file_path}: {e}"

    return f"Successfully suggest file edits"