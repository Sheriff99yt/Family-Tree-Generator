# Family Tree Generator

## How to Use

### Step 1: Input Your Family Data
Enter family relationships in the text box using either of these formats:

1. **Parent-Child Format** (child name must contain parent's full name):
```
# Parent-child relationships (one per line):
John Smith
Jane Smith
Mike John Smith
Sarah John Smith
```

2. **Marriage Format** (using + symbol):
```
# Marriage relationships (using + symbol):
John Smith + Mary Jones
```

### Step 2: Follow Naming Conventions
The names follow this pattern:
- For a basic person: `First Last`
- For a child: `First Parent's_Full_Name`
- For marriages: `Person1 + Person2`

### Step 3: Use Google Sheets Link (Optional)
You can also paste a Google Sheets link containing a "Full Names" column with the family data.

### Step 4: Generate the Family Tree
Click the "Generate" button to create your family tree.

### Step 5: Additional Controls
- Use the search box to find family members
- Adjust vertical/horizontal spacing using the sliders
- Toggle dark/light mode with the moon icon
- Fit the view to screen with the expand icon
- Change tree direction with the arrows icon

## Overview
A vanilla JavaScript/HTML solution for generating family trees from structured text input. Handles complex Arabic naming conventions and relationships, producing formatted tree visualizations with proper Unicode hierarchy symbols.

## Features
- **Input Processing**
  - Spouse entries: `Full Name + Spouse Full Name`
  - Child entries: `Child Full Name` (must contain parent's name as suffix)
- **Relationship Detection**
  - Automatic parent-child linking through name suffixes
  - Implicit ancestor creation for multi-generational names
- **Tree Generation**
  - Multiple independent family lines (surname-based)
  - Folder-style hierarchy with Unicode symbols (└──, ├──, │)
  - Spouse grouping with comma notation
- **Data Integrity**
  - Duplicate prevention for entries and relationships
  - Circular reference prevention
  - Cross-family marriage handling

## Technical Specifications
| Category            | Details                                                                 |
|---------------------|-------------------------------------------------------------------------|
| Language            | Vanilla JavaScript (ES6+) + HTML5 + CSS3                               |
| Visualization       | vis.js Network for interactive tree display                            |
| Search             | Fuse.js for fuzzy name searching                                       |
| Layout             | Custom positioning algorithm with dynamic spacing                       |
| UI Framework       | Pure CSS with CSS Variables for theming                                |

## Code Structure

### Modular Architecture
The application has been refactored into a modular structure for better maintainability and readability. The JavaScript code is organized into the following modules:

- **app.js**: Main application file that coordinates all modules
- **data.js**: Handles data processing and management
- **utils.js**: Contains utility functions
- **visualization.js**: Manages tree visualization
- **ui.js**: Handles user interface functionality

For more details on the modular structure, see [js/README.md](js/README.md).

### Key Functions

#### Tree Generation
```

### JavaScript Functions

#### Core Functions
| Function            | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `clearAll()`        | Clears input/output fields                                                  |
| `generateTree()`    | Main controller function coordinating parsing and tree generation           |

#### Data Processing
| Function                    | Description                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `processSpouses()`          | Handles spouse relationships and duplicate prevention                       |
| `processChild()`           | Processes child entries and establishes parent-child links                  |
| `addPersonWithAncestry()`   | Adds person + implicit ancestors to data structure                          |

#### Tree Building
| Function                    | Description                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `buildSurnameTree()`        | Constructs complete tree for a surname                                      |
| `buildTreeLines()`          | Recursively generates formatted tree lines with proper indentation          |

#### Utilities
| Function                    | Description                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `createPerson()`            | Factory function for new person objects                                     |
| `linkParentChild()`         | Establishes parent-child relationships                                      |
| `getSurname()`              | Extracts last name component from full name                                 |

## Input/Output Examples

### Sample Input
```
شريف رشاد كامل + حسناء أحمد علي
ياسر شريف رشاد كامل + هبة شريف محمود عثمان
بهاء ياسر شريف رشاد كامل
```

### Corresponding Output
```
Family Tree: كامل
└── رشاد كامل
    └── شريف رشاد كامل, حسناء أحمد علي
        └── ياسر شريف رشاد كامل, هبة شريف محمود عثمان
            └── بهاء ياسر شريف رشاد كامل
```

## Implementation Details

### Key Algorithms

1. **Name Parsing**
```javascript
// Extract parent name from child name
"بهاء ياسر شريف رشاد كامل" → "ياسر شريف رشاد كامل"
```

2. **Ancestry Chain Building**
```javascript
function buildAncestryChain() {
  // Creates implicit ancestors for multi-part names
  // "A B C D" creates D ← C D ← B C D ← A B C D
}
```

3. **Spouse-Child Inheritance**
```javascript
// Post-processing to add children to all spouses
people.forEach(person => {
  person.children.forEach(child => {
    person.spouses.forEach(spouse => {
      // Add child to spouse's children array
    });
  });
});
```

4. **Tree Visualization**
```javascript
function buildTreeLines() {
  // Recursive function using depth tracking
  // Builds lines with proper Unicode symbols
  // Handles indentation through prefix arrays
}
```

### Data Structures

| Structure         | Purpose                                      | Key Properties                          |
|-------------------|----------------------------------------------|-----------------------------------------|
| `Person` Object   | Represents individual family member          | name, parent, spouses, children         |
| `Map()`           | O(1) access to all family members            | Key: Full name, Value: Person object    |
| `Set()`           | Unique spouse pair tracking                  | Prevents duplicate marriage entries     |

## Testing Instructions

1. **Basic Test**
```javascript
// Input
أحمد خالد + فاطمة شريف
علي أحمد خالد

// Expected Output
Family Tree: خالد
└── أحمد خالد, فاطمة شريف
    └── علي أحمد خالد
```

2. **Complex Test**
```javascript
// Use provided sample input
// Verify:
- Multiple family trees generated
- Children appear in all relevant parents' trees
- Proper Unicode hierarchy symbols
- Alphabetical sibling ordering
```

## Browser Compatibility
| Browser       | Support |
|---------------|---------|
| Chrome        | ✓ 89+   |
| Firefox       | ✓ 78+   |
| Safari        | ✓ 14+   |
| Edge          | ✓ 91+   |

## Possible Extensions

1. **Additional Features**
- JSON import/export capability
- Collapsible tree nodes
- Relationship validation
- GEDCOM file support

2. **UI Enhancements**
- Interactive node highlighting
- Zoom/Pan controls
- PDF export functionality
- Dark mode toggle


# Expanded Family Tree Generator Documentation

## Architecture Overview

The system follows a modular pipeline architecture:

### Component Flow
![System Architecture Diagram](Architecture%20Overview.svg)

1. **Input-FamilyData**
   - Text input processor
   - Google Sheets link handler
   - Input validation & sanitization

2. **ParsingModule**
   - Name tokenization
   - Relationship extraction
   - Ancestry chain builder
   - Error detection

3. **Data_Structures**
   - Person object store
   - Relationship matrices
   - Family grouping
   - Validation rules

4. **TreeBuilder**
   - Hierarchy construction
   - Position calculation
   - Layout optimization
   - Node placement

5. **VisualizationEngine**
   - Interactive graph rendering
   - Event handling
   - Animation management
   - View controls

6. **OutputRenderer**
   - Visual styling
   - Theme management
   - Responsive display
   - Export options

### Data Flow

## In-Depth Implementation Guide

### 1. Name Processing Engine
**Handling Complex Arabic Names:**

```javascript
// Example: "شريف-سعيد عبد-العظيم العياط"
function processName(name) {
  // Handles:
  // 1. Hyphenated given names (شريف-سعيد)
  // 2. Compound surnames (عبد-العظيم العياط)
  // 3. Parenthetical notations (امال)
  return name.split(/ (?![^(]*\))/); // Split on spaces not inside parentheses
}
```

**Ancestry Chain Algorithm:**
```javascript
function buildAncestry(people, name) {
  let current = name;
  while (current) {
    const parentName = current.split(' ').slice(1).join(' ');
    if (!parentName) break;
    
    if (!people.has(parentName)) {
      people.set(parentName, createPerson(parentName));
    }
    linkParentChild(parentName, current);
    current = parentName;
  }
}
```

### 2. Relationship Matrix

| Relationship Type | Storage Mechanism          | Validation Rules                      |
|-------------------|----------------------------|---------------------------------------|
| Parent-Child      | Person.children array      | Auto-verified through name suffixes   |
| Marriage          | Person.spouses Set         | Bidirectional entry verification      |
| Siblings          | Implicit via parent        | Automatic alphabetical ordering       |

### 3. Tree Building Process
**Recursive Visualization Algorithm:**
```javascript
function buildTreeLines(name, depth, prefixes, isLast) {
  // Base case: Prevent infinite recursion
  if (depth > MAX_DEPTH) return;
  
  // Format current node
  const connectors = calculateConnectors(depth, prefixes, isLast);
  
  // Process children recursively
  people.get(name).children.forEach((child, index) => {
    const lastChild = index === people.get(name).children.length - 1;
    buildTreeLines(child, depth + 1, [...prefixes, lastChild ? ' ' : '│'], lastChild);
  });
}
```

**Unicode Formatting Rules:**
```
Depth 0: Name
Depth 1: └── Name
Depth 2:    ├── Name
         │   └── Name
```

### 4. Error Handling System
**Common Error Patterns:**
```javascript
const ERROR_CODES = {
  INVALID_SPOUSE_FORMAT: {
    code: 1001,
    message: "Spouse entries must use 'Name + Name' format"
  },
  ORPHAN_CHILD: {
    code: 2001,
    message: "Child entry missing parent suffix"
  }
};

function validateInput(line) {
  if (line.includes('+') && line.split('+').length !== 2) {
    throw new FamilyTreeError(ERROR_CODES.INVALID_SPOUSE_FORMAT);
  }
}
```

## Performance Optimization

### Complexity Analysis
| Operation             | Time Complexity | Space Complexity |
|-----------------------|-----------------|------------------|
| Name Parsing          | O(n)            | O(1)             |
| Ancestry Building     | O(k)            | O(k)             | 
| Tree Generation       | O(n log n)      | O(n)             |
| Full Process          | O(n²)           | O(n)             |

*Where k = name component count, n = total entries*

### Memory Management
```javascript
// Optimized data flow
input → Map<Person> → Surname Groups → Rendered Lines
```

## Advanced Configuration

### Customization Options
```javascript
const CONFIG = {
  MAX_DEPTH: 20,                 // Prevent stack overflows
  SPOUSE_SEPARATOR: ' + ',        // Alternative: ' ⚭ '
  INDENT_SIZE: 4,                 // Spaces per depth level
  ALLOW_CROSS_CULTURAL_NAMES: true// Enable non-Arabic name support
};
```

## Developer Guide

### Debugging Techniques
1. **Validation Mode:**
```javascript
function generateTree(debug = false) {
  if (debug) console.log('Raw Input:', rawInput);
  // ...
}
```

2. **Data Inspection:**
```javascript
function inspectPerson(name) {
  const person = people.get(name);
  return {
    ...person,
    spouses: [...person.spouses],
    children: [...person.children]
  };
}
```

### Testing Strategy

**Test Case Matrix:**

| Test Category       | Sample Input                  | Validation Points                     |
|---------------------|-------------------------------|---------------------------------------|
| Basic Marriage      | "أحمد + مريم"                | Spouse appears in both family trees   |
| Multi-Gen Child     | "حفيد شريف أحمد"             | 3-level implicit ancestry created     |
| Complex Marriage     | "عبد-الرحمن + فاطمة-الزهراء"| Hyphen handling verification          |
| Error Handling      | "invalid+format+here"         | Proper error code generation          |

## Localization Support

### RTL Text Handling
```css
/* CSS for Arabic rendering */
pre {
  direction: rtl;
  unicode-bidi: bidi-override;
  font-family: 'Amiri', serif;
  font-size: 1.2em;
}
```

### Date Format Support
```javascript
// Optional birth/death date handling
function createPerson(name) {
  return {
    ...,
    metadata: {
      birthDate: null,
      deathDate: null
    }
  };
}
```

## Security Considerations

1. **Input Sanitization:**
```javascript
function sanitizeInput(text) {
  return text.normalize('NFC') // Normalize Arabic characters
    .replace(/[^\p{L}\s\+()-]/gu, '') // Remove non-letter characters
    .trim();
}
```

2. **Size Limits:**
```javascript
const SAFETY_LIMITS = {
  MAX_INPUT_LENGTH: 10000,    // Characters
  MAX_LINE_COUNT: 500,        // Individual entries
  MAX_TREE_DEPTH: 20          // Generations
};
```

## API Reference (For Extensions)

### Core Methods
```javascript
/**
 * @method getFamilyTrees()
 * @returns {Object} Surname-keyed tree structures
 * @example { 'كامل': { name: '...', children: [...] } }
 */
```

### Event Hooks
```javascript
// Extension point for custom processing
const hooks = {
  preProcess: null,
  postProcess: null,
  renderLine: null
};

function registerHook(hookName, callback) {
  if (hooks[hookName]) hooks[hookName] = callback;
}
```

---