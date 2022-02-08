// import BuildActions from './buildActions';

export interface Csproj {
    Project?: Project
}

export interface Project {
    PropertyGroup?: Array<PropertyGroup>
    ItemGroup?: Array<ItemGroup>
}

export interface PropertyGroup {
    RootNamespace?: Array<string>
    TargetFramework?: Array<string>
    ImplicitUsings?: Array<string>
}

export interface ItemGroup {
    AdditionalFiles?: Array<IncludableItem>
    Compile?: Array<IncludableItem>
    Content?: Array<IncludableItem>
    Folder?: Array<IncludableItem>
    EmbeddedResource?: Array<IncludableItem>
    None?: Array<IncludableItem>
    PackageReference?: Array<IncludableItem>
    Page?: Array<IncludableItem>
    PRIResource?: Array<IncludableItem>
    ProjectReference?: Array<IncludableItem>
    Reference?: Array<IncludableItem>
}

export interface IncludableItem {
    $: IncludableItemAttributes
    Generator?: string
    DependentUpon?: string
    SubType?: string
}

export interface IncludableItemAttributes {
    Include?: string
}
