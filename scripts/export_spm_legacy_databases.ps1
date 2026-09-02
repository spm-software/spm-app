param(
  [string]$SourceDirectory = "C:\Users\Usuario\Documents\Codex\SPM_APP\Bases Datos\Bases Datos",
  [string]$DestinationDirectory = "C:\Users\Usuario\Documents\Codex\SPM_APP\Bases Datos\exports-json"
)

$ErrorActionPreference = "Stop"

function Normalize-AccessFieldName([string]$Value) {
  $decomposed = $Value.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
  return ($decomposed -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
}

$catalog = @(
  @{ id = "aliento-canal"; filePattern = "Aliento canal.mdb"; table = "Aliento Canal"; fields = @{ "numero" = "numero"; "numgen" = "numero_general"; "pasaje" = "pasaje"; "tema" = "tema"; "fecha" = "fecha" } },
  @{ id = "aliento"; filePattern = "Aliento.mdb"; table = "Aliento"; fields = @{ "numero" = "numero"; "pasaje" = "pasaje"; "tema" = "tema"; "fecha" = "fecha" } },
  @{ id = "archivo"; filePattern = "Archivo.mdb"; table = "Archivo"; fields = @{ "numero" = "numero"; "tema" = "tema"; "fecha" = "fecha" } },
  @{ id = "bdb"; filePattern = "BDB.mdb"; table = "BDB"; fields = @{ "numero" = "numero"; "fecha" = "fecha"; "pensandoenalto" = "pensando_en_alto"; "pensaltopasaje" = "pensando_en_alto_pasaje"; "ensenanza" = "ensenanza"; "pasajeensen" = "pasaje_ensenanza"; "alienton" = "aliento_numero"; "aliento" = "aliento"; "alientopasaje" = "aliento_pasaje" } },
  @{ id = "boletin"; filePattern = "Bolet*.mdb"; table = "Boletin"; fields = @{ "numero" = "numero"; "pasaje" = "pasaje"; "tema" = "tema"; "fecha" = "fecha" } },
  @{ id = "comunicaciones"; filePattern = "Comunicaciones.mdb"; table = "Comunicaciones"; fields = @{ "numero" = "numero"; "tipo" = "tipo"; "fecha" = "fecha"; "nombre" = "nombre"; "apellidosidentificacion" = "identificacion"; "localidad" = "localidad"; "pais" = "pais"; "asunto" = "asunto" } },
  @{ id = "directorio"; filePattern = "Directorio.mdb"; table = "Tabla Datos"; fields = @{ "fecha" = "fecha"; "nombre" = "nombre"; "apellidosidentific" = "apellidos"; "direccion" = "direccion"; "ciudad" = "ciudad"; "cp" = "cp"; "pais" = "pais"; "telef1" = "telef1"; "telef2" = "telef2"; "telef3" = "telef3"; "telef4" = "telef4"; "movil1" = "movil1"; "movil2" = "movil2"; "email" = "email"; "nombresposa" = "nombre_esposa"; "numhijos" = "numero_hijos"; "profesion" = "profesion"; "iglesia" = "iglesia"; "observ" = "observaciones"; "numcar" = "numero_carta" } },
  @{ id = "libros"; filePattern = "Libros.mdb"; table = "Libros"; fields = @{ "numero" = "numero"; "titulo" = "titulo"; "autor" = "autor"; "proced" = "procedencia"; "posic" = "posicion"; "denom" = "denominacion"; "idioma" = "idioma"; "tema" = "tema"; "editorial" = "editorial"; "fecha" = "fecha"; "bibliot" = "biblioteca" } },
  @{ id = "temas-canal"; filePattern = "Temas Canal.mdb"; table = "Temas Canal"; fields = @{ "n" = "numero"; "tipo" = "tipo"; "nbosqgral" = "numero_bosquejo_general"; "pasaje" = "pasaje"; "tema" = "tema"; "fecha" = "fecha" } }
)

New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null

foreach ($database in $catalog) {
  $sourceFile = @(Get-ChildItem -LiteralPath $SourceDirectory -Filter $database.filePattern)
  if ($sourceFile.Count -ne 1) { throw "No se encontro una unica base para $($database.id)" }
  $source = $sourceFile[0].FullName
  $destination = Join-Path $DestinationDirectory ("{0}.json" -f $database.id)
  $connection = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$source;Mode=Read;")

  try {
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandText = "SELECT * FROM [$($database.table)]"
    $reader = $command.ExecuteReader()
    $fieldIndexes = @{}
    for ($index = 0; $index -lt $reader.FieldCount; $index++) {
      $fieldIndexes[(Normalize-AccessFieldName $reader.GetName($index))] = $index
    }
    $records = @()
    $rowNumber = 0

    while ($reader.Read()) {
      $rowNumber++
      $data = [ordered]@{}
      foreach ($sourceField in $database.fields.Keys) {
        if (-not $fieldIndexes.ContainsKey($sourceField)) { throw "Falta el campo $sourceField en $($database.id)" }
        $index = $fieldIndexes[$sourceField]
        $value = if ($reader.IsDBNull($index)) { $null } else { $reader.GetValue($index) }
        if ($value -is [datetime]) { $value = $value.ToString("o") }
        $data[$database.fields[$sourceField]] = $value
      }
      $records += [PSCustomObject]@{ source_row_number = $rowNumber; data = [PSCustomObject]$data }
    }

    $payload = [PSCustomObject]@{ source_filename = $sourceFile[0].Name; records = $records }
    $json = $payload | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($destination, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Output ("{0}: {1} records -> {2}" -f $database.id, $rowNumber, $destination)
  }
  finally {
    if ($reader) { $reader.Close() }
    if ($connection.State -eq "Open") { $connection.Close() }
  }
}
